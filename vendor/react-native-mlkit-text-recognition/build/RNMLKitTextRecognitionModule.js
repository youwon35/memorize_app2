"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recognizeText = void 0;
const expo_1 = require("expo");
const textRecognitionModule = (0, expo_1.requireNativeModule)("RNMLKitTextRecognition");
async function recognizeText(imagePath) {
    return await textRecognitionModule.recognizeText(imagePath);
}
exports.recognizeText = recognizeText;
//# sourceMappingURL=RNMLKitTextRecognitionModule.js.map