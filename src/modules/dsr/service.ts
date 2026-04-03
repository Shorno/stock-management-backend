import { db } from "../../db/config";
import { dsr, dsrDocuments } from "../../db/schema";
import { eq, ilike, count } from "drizzle-orm";
import type { CreateDsrInput, UpdateDsrInput, GetDsrsQuery, UpdateDsrProfileInput, CreateDsrDocumentInput } from "./validation";
import type { Dsr, NewDsr, DsrDocument } from "./types";

export const createDsr = async (data: CreateDsrInput): Promise<Dsr> => {
  const newDsr: NewDsr = {
    name: data.name,
  };

  const [createdDsr] = await db.insert(dsr).values(newDsr).returning();
  if (!createdDsr) {
    throw new Error("Failed to create dsr");
  }
  return createdDsr;
};

export const getDsrs = async (
  query: GetDsrsQuery
): Promise<{ dsrs: Dsr[]; total: number }> => {
  const whereClause = query.search
    ? ilike(dsr.name, `%${query.search}%`)
    : undefined;

  const [dsrs, totalResult] = await Promise.all([
    db.query.dsr.findMany({
      where: whereClause,
      limit: query.limit,
      offset: query.offset,
      orderBy: (dsr, { asc }) => [asc(dsr.name)],
    }),
    db
      .select({ count: count() })
      .from(dsr)
      .where(whereClause),
  ]);

  return {
    dsrs,
    total: totalResult[0]?.count || 0,
  };
};

export const getDsrById = async (id: number): Promise<Dsr | undefined> => {
  return await db.query.dsr.findFirst({
    where: (dsr, { eq }) => eq(dsr.id, id),
  });
};

export const updateDsr = async (
  id: number,
  data: UpdateDsrInput
): Promise<Dsr | undefined> => {
  const updateData: Partial<NewDsr> = {
    name: data.name!,
  };

  const [updatedDsr] = await db
    .update(dsr)
    .set(updateData)
    .where(eq(dsr.id, id))
    .returning();

  return updatedDsr;
};

export const deleteDsr = async (id: number): Promise<boolean> => {
  const result = await db.delete(dsr).where(eq(dsr.id, id)).returning();
  return result.length > 0;
};

// ==================== Profile ====================

export const updateDsrProfile = async (
  id: number,
  data: UpdateDsrProfileInput
): Promise<Dsr | undefined> => {
  const updateFields: Record<string, any> = {};

  if (data.phone !== undefined) updateFields.phone = data.phone;
  if (data.address !== undefined) updateFields.address = data.address;
  if (data.nidNumber !== undefined) updateFields.nidNumber = data.nidNumber;
  if (data.emergencyContact !== undefined) updateFields.emergencyContact = data.emergencyContact;
  if (data.notes !== undefined) updateFields.notes = data.notes;
  if (data.profilePhoto !== undefined) updateFields.profilePhoto = data.profilePhoto;

  if (Object.keys(updateFields).length === 0) {
    return await getDsrById(id);
  }

  const [updated] = await db
    .update(dsr)
    .set(updateFields)
    .where(eq(dsr.id, id))
    .returning();

  return updated;
};

// ==================== Documents ====================

export const getDsrDocuments = async (dsrId: number): Promise<DsrDocument[]> => {
  return await db.query.dsrDocuments.findMany({
    where: (doc, { eq }) => eq(doc.dsrId, dsrId),
    orderBy: (doc, { desc }) => [desc(doc.createdAt)],
  });
};

export const addDsrDocument = async (
  dsrId: number,
  data: CreateDsrDocumentInput
): Promise<DsrDocument> => {
  const [doc] = await db
    .insert(dsrDocuments)
    .values({
      dsrId,
      documentType: data.documentType,
      documentName: data.documentName,
      documentUrl: data.documentUrl,
      publicId: data.publicId || null,
    })
    .returning();

  if (!doc) {
    throw new Error("Failed to add document");
  }
  return doc;
};

export const deleteDsrDocument = async (docId: number): Promise<boolean> => {
  const result = await db
    .delete(dsrDocuments)
    .where(eq(dsrDocuments.id, docId))
    .returning();
  return result.length > 0;
};

export const getDsrDocumentById = async (docId: number): Promise<DsrDocument | undefined> => {
  return await db.query.dsrDocuments.findFirst({
    where: (doc, { eq }) => eq(doc.id, docId),
  });
};
