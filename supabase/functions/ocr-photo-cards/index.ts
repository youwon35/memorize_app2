const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...(init.headers ?? {}),
    },
  });

type VisionVertex = {
  x?: number;
  y?: number;
};

type VisionBoundingBox = {
  vertices?: VisionVertex[];
};

type VisionSymbol = {
  text?: string;
};

type VisionWord = {
  boundingBox?: VisionBoundingBox;
  symbols?: VisionSymbol[];
};

type VisionParagraph = {
  boundingBox?: VisionBoundingBox;
  words?: VisionWord[];
};

type VisionBlock = {
  boundingBox?: VisionBoundingBox;
  paragraphs?: VisionParagraph[];
};

type VisionPage = {
  blocks?: VisionBlock[];
};

type FullTextAnnotation = {
  text?: string;
  pages?: VisionPage[];
};

const normalizeFrame = (boundingBox?: VisionBoundingBox | null) => {
  const vertices = boundingBox?.vertices ?? [];

  if (!vertices.length) {
    return null;
  }

  const xs = vertices.map((vertex) => Number(vertex?.x)).filter(Number.isFinite);
  const ys = vertices.map((vertex) => Number(vertex?.y)).filter(Number.isFinite);

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

const getWordText = (word: VisionWord) =>
  (word.symbols ?? []).map((symbol) => symbol.text ?? "").join("").trim();

const normalizeVisionAnnotation = (annotation?: FullTextAnnotation | null) => ({
  blocks: (annotation?.pages ?? []).flatMap((page) =>
    (page.blocks ?? [])
      .map((block) => {
        const lines = (block.paragraphs ?? [])
          .map((paragraph) => {
            const elements = (paragraph.words ?? [])
              .map((word) => {
                const text = getWordText(word);
                const frame = normalizeFrame(word.boundingBox);

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

            if (!elements.length) {
              return null;
            }

            return {
              text: elements.map((element) => element.text).join(" ").replace(/\s+/g, " ").trim(),
              frame:
                normalizeFrame(paragraph.boundingBox) ?? {
                  left: Math.min(...elements.map((element) => element.frame.left)),
                  top: Math.min(...elements.map((element) => element.frame.top)),
                  right: Math.max(...elements.map((element) => element.frame.right)),
                  bottom: Math.max(...elements.map((element) => element.frame.bottom)),
                },
              elements,
            };
          })
          .filter(Boolean);

        if (!lines.length) {
          return null;
        }

        return {
          text: lines.map((line) => line.text).join("\n"),
          frame: normalizeFrame(block.boundingBox),
          lines,
        };
      })
      .filter(Boolean)
  ),
});

const callGoogleVision = async ({
  imageBase64,
  mimeType,
  languages,
}: {
  imageBase64: string;
  mimeType: string;
  languages: string[];
}) => {
  const apiKey = Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY");

  if (!apiKey) {
    throw new Error("GOOGLE_CLOUD_VISION_API_KEY is not configured.");
  }

  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          image: {
            content: imageBase64,
          },
          features: [
            {
              type: "DOCUMENT_TEXT_DETECTION",
              maxResults: 1,
            },
          ],
          imageContext: languages.length
            ? {
                languageHints: languages,
              }
            : undefined,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`VISION_HTTP_${response.status}: ${body}`);
  }

  const payload = await response.json();
  const item = payload?.responses?.[0];

  if (item?.error) {
    throw new Error(`VISION_API_ERROR: ${item.error.message ?? "Unknown Vision API error"}`);
  }

  const normalized = normalizeVisionAnnotation(item?.fullTextAnnotation);

  return {
    provider: "google-cloud-vision",
    mimeType,
    fullText: item?.fullTextAnnotation?.text ?? "",
    recognizedText: normalized,
  };
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, { status: 405 });
  }

  try {
    const body = await request.json();
    const imageBase64 = `${body?.imageBase64 ?? ""}`.trim();
    const mimeType = `${body?.mimeType ?? "image/jpeg"}`.trim();
    const languages = Array.isArray(body?.languages)
      ? body.languages.map((value: unknown) => `${value}`.trim()).filter(Boolean)
      : ["ko", "ja", "en"];

    if (!imageBase64) {
      return json({ error: "imageBase64 is required." }, { status: 400 });
    }

    const result = await callGoogleVision({
      imageBase64,
      mimeType,
      languages,
    });

    return json(result);
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Unexpected OCR function error.",
      },
      { status: 500 }
    );
  }
});
