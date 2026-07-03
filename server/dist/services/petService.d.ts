export interface PetData {
    petXp: number;
    petLevel: number;
    xpToNext: number;
}
export declare function getPetData(playerId: string): Promise<PetData>;
export declare function addPetXp(playerId: string, amount: number): Promise<{
    leveled: boolean;
    data: PetData;
}>;
//# sourceMappingURL=petService.d.ts.map