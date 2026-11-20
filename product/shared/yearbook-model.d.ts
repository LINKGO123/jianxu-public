import type { ResumeDocument } from './schemas.js';
type Options = ResumeDocument['portrait']['yearbook'];
type Pinyin = (name: string, options: {
    toneType: string;
    type: string;
    surname: string;
}) => string[];
declare const model: {
    normalize(raw?: unknown): Options;
    resolveName(options: Options, resume: {
        name?: string;
        englishName?: string;
    }, pinyin?: Pinyin): string;
    resolveMotto(options: Options): string;
    validate(options: Options, resume: {
        name?: string;
        englishName?: string;
    }, pinyin?: Pinyin): string;
    prompt(options: Options): string;
    drawCard(canvas: HTMLCanvasElement, photo: CanvasImageSource & {width:number;height:number}, options: {
        name: string;
        motto: string;
        background?: string;
    }): HTMLCanvasElement;
    mottos: Record<string, string>;
};
export default model;
