import { db } from "../../db/config";
import { suppliers, supplierPurchases, supplierPayments } from "../../db/schema";
import { eq, desc, sum } from "drizzle-orm";

// ==================== TYPES ====================

export interface CreateSupplierDto {
    name: string;
    phone?: string;
    address?: string;
}

export interface UpdateSupplierDto {
    name?: string;
    phone?: string;
    address?: string;
}

export interface CreatePurchaseDto {
    amount: number;
    purchaseDate: string;
    description?: string;
}

export interface CreatePaymentDto {
    amount: number;
    paymentDate: string;
    paymentMethod?: string;
    note?: string;
}

export interface SupplierWithBalance {
    id: number;
    name: string;
    phone: string | null;
    address: string | null;
    totalPurchases: number;
    totalPayments: number;
    balance: number;
    createdAt: Date | null;
}

// ==================== SUPPLIER CRUD ====================

export async function getAllSuppliers(): Promise<SupplierWithBalance[]> {
    const allSuppliers = await db.query.suppliers.findMany({
        orderBy: [desc(suppliers.createdAt)],
    });

    // Calculate balances for each supplier
    const result: SupplierWithBalance[] = [];

    for (const supplier of allSuppliers) {
        const balance = await getSupplierBalance(supplier.id);
        result.push({
            ...supplier,
            ...balance,
        });
    }

    return result;
}

export async function getSupplierById(id: number) {
    const supplier = await db.query.suppliers.findFirst({
        where: eq(suppliers.id, id),
        with: {
            purchases: {
                orderBy: [desc(supplierPurchases.purchaseDate)],
            },
            payments: {
                orderBy: [desc(supplierPayments.paymentDate)],
            },
        },
    });

    if (!supplier) return null;

    const balance = await getSupplierBalance(id);

    return {
        ...supplier,
        ...balance,
    };
}

export async function createSupplier(data: CreateSupplierDto) {
    const [supplier] = await db
        .insert(suppliers)
        .values({
            name: data.name,
            phone: data.phone,
            address: data.address,
        })
        .returning();

    return supplier;
}

export async function updateSupplier(id: number, data: UpdateSupplierDto) {
    const [supplier] = await db
        .update(suppliers)
        .set({
            ...data,
            updatedAt: new Date(),
        })
        .where(eq(suppliers.id, id))
        .returning();

    return supplier;
}

export async function deleteSupplier(id: number) {
    await db.delete(suppliers).where(eq(suppliers.id, id));
}

// ==================== PURCHASES ====================

export async function addPurchase(supplierId: number, data: CreatePurchaseDto) {
    const [purchase] = await db
        .insert(supplierPurchases)
        .values({
            supplierId,
            amount: data.amount.toString(),
            purchaseDate: data.purchaseDate,
            description: data.description,
        })
        .returning();

    return purchase;
}

export async function getPurchasesBySupplierId(supplierId: number) {
    return db.query.supplierPurchases.findMany({
        where: eq(supplierPurchases.supplierId, supplierId),
        orderBy: [desc(supplierPurchases.purchaseDate)],
    });
}

export async function deletePurchase(id: number) {
    await db.delete(supplierPurchases).where(eq(supplierPurchases.id, id));
}

// ==================== PAYMENTS ====================

export async function addPayment(supplierId: number, data: CreatePaymentDto) {
    const [payment] = await db
        .insert(supplierPayments)
        .values({
            supplierId,
            amount: data.amount.toString(),
            paymentDate: data.paymentDate,
            paymentMethod: data.paymentMethod,
            note: data.note,
        })
        .returning();

    return payment;
}

export async function getPaymentsBySupplierId(supplierId: number) {
    return db.query.supplierPayments.findMany({
        where: eq(supplierPayments.supplierId, supplierId),
        orderBy: [desc(supplierPayments.paymentDate)],
    });
}

export async function deletePayment(id: number) {
    await db.delete(supplierPayments).where(eq(supplierPayments.id, id));
}

// ==================== BALANCE CALCULATION ====================

export async function getSupplierBalance(supplierId: number) {
    const purchasesResult = await db
        .select({ total: sum(supplierPurchases.amount) })
        .from(supplierPurchases)
        .where(eq(supplierPurchases.supplierId, supplierId));

    const paymentsResult = await db
        .select({ total: sum(supplierPayments.amount) })
        .from(supplierPayments)
        .where(eq(supplierPayments.supplierId, supplierId));

    const totalPurchases = Number(purchasesResult[0]?.total || 0);
    const totalPayments = Number(paymentsResult[0]?.total || 0);
    const balance = totalPurchases - totalPayments;

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

    return totalPurchases - totalPayments;
}
