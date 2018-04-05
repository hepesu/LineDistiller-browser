<template>
    <div>
        <div>
            <input v-model="imgSrc" v-on:keyup.enter="loadInput" />
            <input type="file" v-on:change="inputImg" class="upload-pic" value="Upload Image">
        </div>
        <div v-on:drop.prevent="inputImg" v-on:dragover.prevent style="width:64px;height:64px;background:gray;border:1px solid black;">Drop Image</div>
        <button v-on:click="runPredict" v-bind:disabled="modelLoaded===false||modelRunning===true">Run</button>
        <span>Progress: {{modelRunningProgress}}%</span>
        <div>
            <div>
                <canvas ref="input-canvas" :width="imgWidth" :height="imgHeight"></canvas>
            </div>
            <div>
                <canvas ref="output-canvas" :width="imgWidth" :height="imgHeight"></canvas>
            </div>
        </div>
    </div>
</template>

<script>
import * as tf from "@tensorflow/tfjs";
import ndarray from "ndarray";
import ops from "ndarray-ops";
import range from "lodash/range";
import Promise from "bluebird";
import cwise from "cwise";

import {
    rgb2gray,
    rgb2grayCIE,
    normalize,
    over,
    clamp
} from "./utils";
import masks from "./masks";
import {
    equalizeHist,
    equalizeHistAdaptive
} from "./histogram";
import {
    setTimeout
} from "timers";

const MODEL_PATH =
    process.env.NODE_ENV === "production" ?
    "https://hepesu.github.io/LineDistiller-browser/assets/model_180102/model.json" :
    "./assets/model_180102/model.json";

const inputProcess = cwise({
    args: ["array"],
    body: function (a) {
        a = a / 255;
    }
});

const outputProcess = cwise({
    args: ["array"],
    body: function (a) {
        a = a * 255;
    }
});

export default {
    async created() {
        this.model = await tf.loadModel(MODEL_PATH);
        this.modelLoaded = true;
        //load mask and store
        this.masks = masks;
    },
    data: {
        imgSrc: "",
        imgWidth: 0,
        imgHeight: 0,
        patchSize: 128,
        patchStride: 96,
        modelLoaded: false,
        modelRunning: false,
        modelRunningProgress: 0
    },
    methods: {
        loadInput() {
            const ctx = this.$refs["input-canvas"].getContext("2d");

            const img = new Image();
            img.src = this.imgSrc;
            img.onload = () => {
                this.imgWidth = img.width;
                this.imgHeight = img.height;

                this.$nextTick(() => {
                    ctx.drawImage(img, 0, 0);
                });
            };
        },
        generatePatches() {
            const ctx = this.$refs["input-canvas"].getContext("2d");
            const imageData = ctx.getImageData(
                0,
                0,
                ctx.canvas.width,
                ctx.canvas.height
            );
            const {
                data,
                width,
                height
            } = imageData;

            const dataTensor = ndarray(new Float32Array(data), [height, width, 4]);
            const grayTensor = ndarray(new Float32Array(height * width * 1), [
                height,
                width,
                1
            ]);

            rgb2grayCIE(
                grayTensor.pick(null, null, 0),
                dataTensor.pick(null, null, 0),
                dataTensor.pick(null, null, 1),
                dataTensor.pick(null, null, 2)
            );

            equalizeHistAdaptive(grayTensor, 2);

            const i0List = range(0, height, this.patchStride);
            const j0List = range(0, width, this.patchStride);

            const patches = [];
            const size = this.patchSize;

            for (let i0Index = 0; i0Index < i0List.length; i0Index++) {
                const i0 = i0List[i0Index];
                for (let j0Index = 0; j0Index < j0List.length; j0Index++) {
                    const j0 = j0List[j0Index];
                    const patch = ndarray(new Float32Array(size * size * 1), [
                        size,
                        size,
                        1
                    ]);
                    const i1 = i0 + size > height ? height : i0 + size;
                    const j1 = j0 + size > width ? width : j0 + size;
                    ops.assigns(patch.pick(null, null, 0), 255);
                    ops.assign(
                        patch
                        .hi(i1 - i0, j1 - j0, 0)
                        .lo(0, 0, 0)
                        .pick(null, null, 0),
                        grayTensor
                        .hi(i1, j1, 0)
                        .lo(i0, j0, 0)
                        .pick(null, null, 0)
                    );
                    inputProcess(patch);
                    patches.push(patch.data);
                }
            }
            return patches;
        },
        combinePatches(patches) {
            const size = this.patchSize;
            const stride = this.patchStride;

            const i0List = range(0, this.imgHeight, stride);
            const j0List = range(0, this.imgWidth, stride);

            const combinedShape = [this.imgHeight, this.imgWidth, 1];
            const combined = ndarray(
                new Float32Array(this.imgHeight * this.imgWidth * 1),
                combinedShape
            );
            ops.assigns(combined.pick(null, null, 0), 0);

            const denorm = ndarray(
                new Float32Array(this.imgHeight * this.imgWidth * 1),
                combinedShape
            );
            ops.assigns(denorm.pick(null, null, 0), 0.00001);

            const patchOnes = ndarray(new Float32Array(size * size * 1), [
                size,
                size,
                1
            ]);
            ops.assigns(patchOnes, 1);

            for (let n = 0, len = patches.length; n < len; n++) {
                const i0 = i0List[Math.floor(n / j0List.length)];
                const j0 = j0List[n % j0List.length];
                const patchHeight =
                    i0 + size > this.imgHeight ? this.imgHeight - i0 : size;
                const patchWidth =
                    j0 + size > this.imgWidth ? this.imgWidth - j0 : size;

                let mask = this.masks.center;

                if (j0 == j0List[0] && i0 == i0List[0]) mask = this.masks.leftTopCorner;
                else if (j0 == j0List[j0List.length - 1] && i0 == i0List[0])
                    mask = this.masks.rightTopCorner;
                else if (j0 == j0List[0] && i0 == i0List[i0List.length - 1])
                    mask = this.masks.leftBottomCorner;
                else if (
                    j0 == j0List[j0List.length - 1] &&
                    i0 == i0List[i0List.length - 1]
                )
                    mask = this.masks.rightBottomCorner;
                else if (j0 == j0List[0]) mask = this.masks.leftBorder;
                else if (j0 == j0List[j0List.length - 1]) mask = this.masks.rightBorder;
                else if (i0 == i0List[0]) mask = this.masks.topBorder;
                else if (i0 == i0List[i0List.length - 1])
                    mask = this.masks.bottomBorder;

                over(
                    combined
                    .hi(i0 + patchHeight, j0 + patchWidth, 0)
                    .lo(i0, j0, 0)
                    .pick(null, null, 0),
                    patches[n]
                    .hi(patchHeight, patchWidth, 0)
                    .lo(0, 0, 0)
                    .pick(null, null, 0),
                    mask.hi(patchHeight, patchWidth, 0).lo(0, 0, 0)
                );

                over(
                    denorm
                    .hi(i0 + patchHeight, j0 + patchWidth, 0)
                    .lo(i0, j0, 0)
                    .pick(null, null, 0),
                    patchOnes
                    .hi(patchHeight, patchWidth, 0)
                    .lo(0, 0, 0)
                    .pick(null, null, 0),
                    mask.hi(patchHeight, patchWidth, 0).lo(0, 0, 0)
                );
            }

            normalize(combined, denorm);
            outputProcess(combined);
            clamp(combined, 0, 255);

            // assign channels
            const outShape = [this.imgHeight, this.imgWidth, 4];
            const output = ndarray(
                new Float32Array(this.imgHeight * this.imgWidth * 4),
                outShape
            );

            ops.assign(output.pick(null, null, 0), combined.pick(null, null, 0));
            ops.assign(output.pick(null, null, 1), combined.pick(null, null, 0));
            ops.assign(output.pick(null, null, 2), combined.pick(null, null, 0));
            ops.assigns(output.pick(null, null, 3), 255);

            return output.data;
        },
        async runPredict() {
            const sleep = (time) => {
                return new Promise((resolve, reject) => {
                    setTimeout(() => {
                        resolve();
                    }, time);
                });
            };

            this.modelRunningProgress = 0;
            this.modelRunning = true;
            let currentRun = 1;

            // trigger browser redraw
            await sleep(10);

            const inputPatches = this.generatePatches();

            const outputPatches = await Promise.mapSeries(inputPatches, async patch => {
                const buffer = tf.buffer([this.patchSize, this.patchSize], "float32", patch);

                const inputTensor = buffer.toTensor();
                const outputTensor = this.model.predict(
                    inputTensor.reshape([1, this.patchSize, this.patchSize, 1])
                );

                const outputData = await outputTensor.data();

                // trigger browser redraw
                await sleep(10);
                console.log("Model Running");
                this.modelRunningProgress = Math.round(
                    currentRun++/ inputPatches.length * 100
                );

                // release tensor memory
                inputTensor.dispose();
                outputTensor.dispose();

                return ndarray(outputData, [this.patchSize, this.patchSize, 1]);
            });

            this.loadOutput(this.combinePatches(outputPatches));
            this.modelRunning = false;
        },
        loadOutput(imageData) {
            const image = new ImageData(
                new Uint8ClampedArray(imageData),
                this.imgWidth,
                this.imgHeight
            );
            const ctx = this.$refs["output-canvas"].getContext("2d");
            ctx.putImageData(image, 0, 0);
        },
        inputImg(ev) {
            const ctx = this.$refs["input-canvas"].getContext("2d");

            const reader = new FileReader();
            reader.onload = event => {
                var img = new Image();
                img.onload = () => {
                    this.imgWidth = img.width;
                    this.imgHeight = img.height;

                    this.$nextTick(() => {
                        ctx.drawImage(img, 0, 0);
                    });
                };
                img.src = event.target.result;
            };

            if (ev.dataTransfer) {
                if (ev.dataTransfer.files[0])
                    reader.readAsDataURL(ev.dataTransfer.files[0]);
            } else {
                if (ev.target.files[0]) reader.readAsDataURL(ev.target.files[0]);
            }
        }
    }
};
</script>

<style>

</style>