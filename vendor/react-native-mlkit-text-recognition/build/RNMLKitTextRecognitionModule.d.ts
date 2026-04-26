interface Rect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}
interface TextElement {
    text: string;
    frame: Rect;
    recognizedLanguages: string[];
}
interface TextLine {
    text: string;
    frame: Rect;
    recognizedLanguages: string[];
    elements: TextElement[];
}
interface Block {
    text: string;
    frame: Rect;
    recognizedLanguages: string[];
    lines: TextLine[];
}
interface Text {
    text: string;
    blocks: Block[];
}
declare function recognizeText(imagePath: string): Promise<Text>;
export { recognizeText };
export type { Text, Block, TextLine, TextElement, Rect };
