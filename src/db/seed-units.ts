import { db } from "./config";
import { unit } from "./schema";

// Standard units to seed
const standardUnits = [
    { name: "Piece", abbreviation: "PCS", multiplier: 1, isBase: true },
    { name: "Kilogram", abbreviation: "KG", multiplier: 1, isBase: true },
    { name: "Gram", abbreviation: "GM", multiplier: 1, isBase: true },
    { name: "Liter", abbreviation: "LTR", multiplier: 1, isBase: true },
    { name: "Milliliter", abbreviation: "ML", multiplier: 1, isBase: true },
    { name: "Box", abbreviation: "BOX", multiplier: 12, isBase: false },
    { name: "Carton", abbreviation: "CRT", multiplier: 24, isBase: false },
    { name: "Dozen", abbreviation: "DOZEN", multiplier: 12, isBase: false },
    { name: "Pack", abbreviation: "PACK", multiplier: 6, isBase: false },
    { name: "Case", abbreviation: "CASE", multiplier: 24, isBase: false },
];

export async function seedUnits() {
    console.log("🌱 Seeding standard units...");

    for (const unitData of standardUnits) {
        try {
            // Check if unit already exists
            const existing = await db.query.unit.findFirst({
                where: (units, { eq }) => eq(units.abbreviation, unitData.abbreviation),
            });

            if (existing) {
                console.log(`  ⏭️  Unit "${unitData.name}" (${unitData.abbreviation}) already exists, skipping`);
                continue;
            }

            await db.insert(unit).values(unitData);
            console.log(`  ✅ Created unit: ${unitData.name} (${unitData.abbreviation}) - multiplier: ${unitData.multiplier}`);
        } catch (error) {
            console.error(`  ❌ Failed to create unit "${unitData.name}":`, error);
        }
    }

    console.log("✅ Unit seeding complete!");
}

// Run if called directly
if (import.meta.main) {
    seedUnits()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("Seed failed:", error);
            process.exit(1);
        });
}
