import { db } from "../../db/config/index.js";
import { route } from "../../db/schema/index.js";
import { eq, ilike, count } from "drizzle-orm";
import { generateSlug } from "../../lib/slug.js";
import type { CreateRouteInput, UpdateRouteInput, GetRoutesQuery } from "./validation.js";
import type { Route, NewRoute } from "./types.js";

export const createRoute = async (data: CreateRouteInput): Promise<Route> => {
  const slug = generateSlug(data.name);

  const newRoute: NewRoute = {
    name: data.name,
    slug,
  };

  const [createdRoute] = await db.insert(route).values(newRoute).returning();
  return createdRoute;
};

export const getRoutes = async (
  query: GetRoutesQuery
): Promise<{ routes: Route[]; total: number }> => {
  const whereClause = query.search
    ? ilike(route.name, `%${query.search}%`)
    : undefined;

  const [routes, totalResult] = await Promise.all([
    db.query.route.findMany({
      where: whereClause,
      limit: query.limit,
      offset: query.offset,
      orderBy: (route, { asc }) => [asc(route.name)],
    }),
    db
      .select({ count: count() })
      .from(route)
      .where(whereClause),
  ]);

  return {
    routes,
    total: totalResult[0]?.count || 0,
  };
};

export const getRouteById = async (id: number): Promise<Route | undefined> => {
  return await db.query.route.findFirst({
    where: (route, { eq }) => eq(route.id, id),
  });
};

export const updateRoute = async (
  id: number,
  data: UpdateRouteInput
): Promise<Route | undefined> => {
  // Since name is the only updateable field, auto-generate slug
  const updateData: Partial<NewRoute> = {
    name: data.name!,
    slug: generateSlug(data.name!),
  };

  const [updatedRoute] = await db
    .update(route)
    .set(updateData)
    .where(eq(route.id, id))
    .returning();

  return updatedRoute;
};

export const deleteRoute = async (id: number): Promise<boolean> => {
  const result = await db.delete(route).where(eq(route.id, id)).returning();
  return result.length > 0;
};

