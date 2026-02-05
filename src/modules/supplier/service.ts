import { db } from "../../db/config";
import { brand } from "../../db/schema/product-schema";
import { supplierPurchases, supplierPayments } from "../../db/schema";
import { eq, desc, sum } from "drizzle-orm";

// ==================== TYPES ====================

export interface CreatePurchaseDto {
    amount: number;
    purchaseDate: string;
    description?: string;
}

export interface CreatePaymentDto {
    amount: number;
    paymentDate: string;
    paymentMethod?: string;
    fromCashBalance?: boolean;
    note?: string;
}

export interface CompanyWithBalance {
    id: number;
    name: string;
    totalPurchases: number;
    totalPayments: number;
    balance: number;
    createdAt: Date | null;
}

// ==================== GET ALL COMPANIES (BRANDS) AS SUPPLIERS ====================

export async function getAllSuppliers(): Promise<CompanyWithBalance[]> {
    const allBrands = await db.select().from(brand).orderBy(desc(brand.createdAt));

    // Calculate balances for each brand
    const result: CompanyWithBalance[] = [];

    for (const b of allBrands) {
        const balance = await getSupplierBalance(b.id);
        result.push({
            id: b.id,
            name: b.name,
            ...balance,
            createdAt: b.createdAt,
        });
    }

    return result;
}

// ==================== GET SINGLE COMPANY (BRAND) WITH TRANSACTIONS ====================

export async function getSupplierById(brandId: number) {
    const [b] = await db.select().from(brand).where(eq(brand.id, brandId)).limit(1);

    if (!b) return null;

    // Get purchases and payments for this brand
    const purchases = await db.select()
        .from(supplierPurchases)
        .where(eq(supplierPurchases.brandId, brandId))
        .orderBy(desc(supplierPurchases.purchaseDate));

    const payments = await db.select()
        .from(supplierPayments)
        .where(eq(supplierPayments.brandId, brandId))
        .orderBy(desc(supplierPayments.paymentDate));

    const balance = await getSupplierBalance(brandId);

    return {
        id: b.id,
        name: b.name,
        phone: null, // Brands don't have phone/address - can be extended later
        address: null,
        purchases,
        payments,
        ...balance,
        createdAt: b.createdAt,
    };
}

// ==================== PURCHASES ====================

export async function addPurchase(brandId: number, data: CreatePurchaseDto) {
    const [purchase] = await db
        .insert(supplierPurchases)
        .values({
            brandId,
            amount: data.amount.toString(),
            purchaseDate: data.purchaseDate,
            description: data.description,
        })
        .returning();

    return purchase;
}

export async function getPurchasesByBrandId(brandId: number) {
    return db.query.supplierPurchases.findMany({
        where: eq(supplierPurchases.brandId, brandId),
        orderBy: [desc(supplierPurchases.purchaseDate)],
    });
}

export async function deletePurchase(id: number) {
    await db.delete(supplierPurchases).where(eq(supplierPurchases.id, id));
}

// ==================== PAYMENTS ====================

export async function addPayment(brandId: number, data: CreatePaymentDto) {
    // If payment should deduct from cash balance, validate sufficient balance exists
    if (data.fromCashBalance) {
        const { getCurrentCashBalance } = await import("../analytics/service");
        const currentCashBalance = await getCurrentCashBalance();

        if (data.amount > currentCashBalance) {
            throw new Error(`Insufficient cash balance. Available: ৳${currentCashBalance.toFixed(2)}, Requested: ৳${data.amount.toFixed(2)}`);
        }
    }

    const [payment] = await db
        .insert(supplierPayments)
        .values({
            brandId,
            amount: data.amount.toString(),
            paymentDate: data.paymentDate,
            paymentMethod: data.paymentMethod,
            fromCashBalance: data.fromCashBalance ?? false,
            note: data.note,
        })
        .returning();

    return payment;
}

export async function getPaymentsByBrandId(brandId: number) {
    return db.query.supplierPayments.findMany({
        where: eq(supplierPayments.brandId, brandId),
        orderBy: [desc(supplierPayments.paymentDate)],
    });
}

export async function deletePayment(id: number) {
    await db.delete(supplierPayments).where(eq(supplierPayments.id, id));
}

// ==================== BALANCE CALCULATION ====================

export async function getSupplierBalance(brandId: number) {
    const purchasesResult = await db
        .select({ total: sum(supplierPurchases.amount) })
        .from(supplierPurchases)
        .where(eq(supplierPurchases.brandId, brandId));

    const paymentsResult = await db
        .select({ total: sum(supplierPayments.amount) })
        .from(supplierPayments)
        .where(eq(supplierPayments.brandId, brandId));

    const totalPurchases = Number(purchasesResult[0]?.total || 0);
    const totalPayments = Number(paymentsResult[0]?.total || 0);
    // Balance = Payments - Purchases
    // Positive = Supplier owes us (we've overpaid)
    // Negative = We owe supplier (need to pay more)
    const balance = totalPayments - totalPurchases;

    return { totalPurchases, totalPayments, balance };
}

// ==================== TOTAL SUPPLIER DUE ====================

export async function getTotalSupplierDue(): Promise<number> {
    const purchasesResult = await db
        .select({ total: sum(supplierPurchases.amount) })
        .from(supplierPurchases);

    const paymentsResult = await db
        .select({ total: sum(supplierPayments.amount) })
        .from(supplierPayments);

    const totalPurchases = Number(purchasesResult[0]?.total || 0);
    const totalPayments = Number(paymentsResult[0]?.total || 0);

    // Positive = Suppliers owe us, Negative = We owe suppliers
    return totalPayments - totalPurchases;
}
