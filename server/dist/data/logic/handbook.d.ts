export interface HandbookSection {
    /** ქვესათაური */
    h: string;
    /** აბზაცები — თითოეული ცალკე ჩანს */
    p: string[];
    /** ფორმალური ჩანაწერი, თუ არსებობს (მონოსივრცის ბლოკად ჩანს) */
    formal?: string[];
    /** კონკრეტული მაგალითი ბუნებრივ ენაზე */
    example?: string;
    /** ტიპური შეცდომა, რომელსაც ეს წესი იჭერს */
    pitfall?: string;
    /** საინტერესო აკადემიური დეტალი / ისტორია */
    note?: string;
}
export interface HandbookChapter {
    id: string;
    icon: string;
    title: string;
    /** ერთი წინადადება, რაზეა თავი */
    blurb: string;
    sections: HandbookSection[];
}
export declare const HANDBOOK: HandbookChapter[];
export declare const HANDBOOK_CHAPTERS: number;
export declare const HANDBOOK_SECTIONS: number;
//# sourceMappingURL=handbook.d.ts.map