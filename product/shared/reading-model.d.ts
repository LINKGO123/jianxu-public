import type { ReadingStrategy } from './schemas.js';
declare const model: {
    sections: {
        id: string;
        name: string;
        fields: string[];
    }[];
    normalize(value: unknown): ReadingStrategy;
    available(id: string, resume: Record<string, string>): boolean;
    visible(value: unknown, resume: Record<string, string>): string[];
    primary(value: unknown, resume: Record<string, string>): string | null;
    preset(profile: string, current: unknown): ReadingStrategy;
    name(value: unknown): string;
};
export default model;
