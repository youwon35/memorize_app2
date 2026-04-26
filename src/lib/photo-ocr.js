import { EncodingType, readAsStringAsync } from "expo-file-system/legacy";

import { extractPairsFromRecognizedText } from "../utils/memory";
import { isSupabaseConfigured, supabase } from "./supabase";

const OCR_FUNCTION_NAME = "ocr-photo-cards";
const CLOUD_OCR_LANGUAGES = ["ko", "ja", "en"];

const getAssetMimeType = (asset = {}) => {
  if (asset?.mimeType && typeof asset.mimeType === "string") {
    return asset.mimeType;
  }

  const fileName = asset?.fileName ?? asset?.uri ?? "";
  const extension = `${fileName}`.split(".").pop()?.toLowerCase();

  if (extension === "png") {
    return "image/png";
  }

  if (extension === "webp") {
    return "image/webp";
  }

  if (extension === "heic" || extension === "heif") {
    return "image/heic";
  }

  return "image/jpeg";
};

const normalizeBoundingBox = (boundingBox) => {
  const vertices = Array.isArray(boundingBox?.vertices)
    ? boundingBox.vertices
    : Array.isArray(boundingBox?.normalizedVertices)
      ? boundingBox.normalizedVertices
      : [];

  if (!vertices.length) {
    return null;
  }

  const xs = vertices
    .map((vertex) => Number(vertex?.x))
    .filter(Number.isFinite);
  const ys = vertices
    .map((vertex) => Number(vertex?.y))
    .filter(Number.isFinite);

  if (!xs.length || !ys.length) {
    return null;
  }

  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
};

const getWordText = (word) => {
  const symbols = Array.isArray(word?.symbols) ? word.symbols : [];

  if (!symbols.length) {
    return `${word?.text ?? ""}`.trim();
  }

  return symbols.map((symbol) => symbol?.text ?? "").join("").trim();
};

const buildLineFromParagraph = (paragraph) => {
  const words = (paragraph?.words ?? [])
    .map((word) => {
      const text = getWordText(word);
      const frame = normalizeBoundingBox(word?.boundingBox);

      if (!text || !frame) {
        return null;
      }

      return {
        text,
        frame,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.frame.left - right.frame.left);

  if (!words.length) {
    return null;
  }

  const paragraphFrame = normalizeBoundingBox(paragraph?.boundingBox);

  return {
    text: words.map((word) => word.text).join(" ").replace(/\s+/g, " ").trim(),
    frame:
      paragraphFrame ?? {
        left: Math.min(...words.map((word) => word.frame.left)),
        top: Math.min(...words.map((word) => word.frame.top)),
        right: Math.max(...words.map((word) => word.frame.right)),
        bottom: Math.max(...words.map((word) => word.frame.bottom)),
      },
    elements: words,
  };
};

const buildRecognizedTextFromVision = (annotation) => ({
  blocks: (annotation?.pages ?? []).flatMap((page) =>
    (page?.blocks ?? [])
      .map((block) => {
        const lines = (block?.paragraphs ?? [])
          .map((paragraph) => buildLineFromParagraph(paragraph))
          .filter(Boolean);

        if (!lines.length) {
          return null;
        }

        return {
          text: lines.map((line) => line.text).join("\n"),
          frame: normalizeBoundingBox(block?.boundingBox) ?? null,
          lines,
        };
      })
      .filter(Boolean)
  ),
});

const classifyCloudFailure = (error) => {
  const message = `${error?.message ?? error ?? ""}`.toLowerCase();

  if (
    message.includes("404") ||
    message.includes("not found") ||
    message.includes("failed to send a request") ||
    message.includes("network request failed")
  ) {
    return "unavailable";
  }

  return "failed";
};

const runLocalOcr = async (asset) => {
  let recognizeText;

  try {
    ({ recognizeText } = require("@infinitered/react-native-mlkit-text-recognition"));
  } catch (error) {
    throw new Error("LOCAL_OCR_UNAVAILABLE");
  }

  const recognitionResult = await recognizeText(asset.uri);

  return {
    provider: "local",
    recognizedText: recognitionResult,
    ...extractPairsFromRecognizedText(recognitionResult, {
      width: asset.width,
      height: asset.height,
    }),
  };
};

const runCloudOcr = async (asset) => {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  const imageBase64 = await readAsStringAsync(asset.uri, {
    encoding: EncodingType.Base64,
  });

  const { data, error } = await supabase.functions.invoke(OCR_FUNCTION_NAME, {
    body: {
      imageBase64,
      mimeType: getAssetMimeType(asset),
      languages: CLOUD_OCR_LANGUAGES,
    },
  });

  if (error) {
    throw error;
  }

  if (!data?.recognizedText) {
    throw new Error("CLOUD_OCR_INVALID_RESPONSE");
  }

  return {
    provider: "cloud",
    providerName: data.provider ?? "google-cloud-vision",
    recognizedText: data.recognizedText,
    fullText: data.fullText ?? "",
    ...extractPairsFromRecognizedText(data.recognizedText, {
      width: asset.width,
      height: asset.height,
    }),
  };
};

export const recognizePhotoCardPairs = async (asset) => {
  let cloudError = null;

  if (isSupabaseConfigured && supabase) {
    try {
      const cloudResult = await runCloudOcr(asset);

      if (cloudResult) {
        return {
          ...cloudResult,
          providerNoticeKey: "save.photoCloudUsed",
        };
      }
    } catch (error) {
      cloudError = error;
    }
  }

  const localResult = await runLocalOcr(asset);

  return {
    ...localResult,
    providerNoticeKey: cloudError
      ? classifyCloudFailure(cloudError) === "unavailable"
        ? "save.photoCloudUnavailableFallback"
        : "save.photoCloudFailedFallback"
      : "save.photoLocalUsed",
  };
};
