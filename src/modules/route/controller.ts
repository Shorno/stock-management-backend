import type { Context } from "hono";
import type { CreateRouteInput, UpdateRouteInput, GetRoutesQuery } from "./validation.js";
import type { RouteResponse } from "./types.js";
import * as routeService from "./service.js";

type AppContext = Context<
  {
    Variables: {
      user: { id: string; email: string } | null;
      session: any | null;
    };
  },
  any,
  {
    in: {
      json?: CreateRouteInput | UpdateRouteInput;
      query?: GetRoutesQuery;
    };
    out: {
      json?: CreateRouteInput | UpdateRouteInput;
      query?: GetRoutesQuery;
    };
  }
>;

export const handleCreateRoute = async (c: AppContext): Promise<Response> => {
  try {
    const validatedData = c.req.valid("json") as CreateRouteInput;
    const newRoute = await routeService.createRoute(validatedData);

    return c.json<RouteResponse>(
      {
        success: true,
        data: newRoute,
        message: "Route created successfully",
      },
      201
    );
  } catch (error) {
    console.error("Error creating route:", error);
    return c.json<RouteResponse>(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to create route",
      },
      500
    );
  }
};

export const handleGetRoutes = async (c: AppContext): Promise<Response> => {
  try {
    const validatedQuery = c.req.valid("query") as GetRoutesQuery;
    const { routes, total } = await routeService.getRoutes(validatedQuery);

    return c.json<RouteResponse>({
      success: true,
      data: routes,
      total,
    });
  } catch (error) {
    console.error("Error fetching routes:", error);
    return c.json<RouteResponse>(
      {
        success: false,
        message: "Failed to fetch routes",
      },
      500
    );
  }
};

export const handleGetRouteById = async (c: AppContext): Promise<Response> => {
  try {
    const id = Number(c.req.param("id"));

    if (isNaN(id)) {
      return c.json<RouteResponse>(
        {
          success: false,
          message: "Invalid route ID",
        },
        400
      );
    }

    const route = await routeService.getRouteById(id);

    if (!route) {
      return c.json<RouteResponse>(
        {
          success: false,
          message: "Route not found",
        },
        404
      );
    }

    return c.json<RouteResponse>({
      success: true,
      data: route,
    });
  } catch (error) {
    console.error("Error fetching route:", error);
    return c.json<RouteResponse>(
      {
        success: false,
        message: "Failed to fetch route",
      },
      500
    );
  }
};

export const handleUpdateRoute = async (c: AppContext): Promise<Response> => {
  try {
    const id = Number(c.req.param("id"));

    if (isNaN(id)) {
      return c.json<RouteResponse>(
        {
          success: false,
          message: "Invalid route ID",
        },
        400
      );
    }

    const validatedData = c.req.valid("json") as UpdateRouteInput;
    const updatedRoute = await routeService.updateRoute(id, validatedData);

    if (!updatedRoute) {
      return c.json<RouteResponse>(
        {
          success: false,
          message: "Route not found",
        },
        404
      );
    }

    return c.json<RouteResponse>({
      success: true,
      data: updatedRoute,
      message: "Route updated successfully",
    });
  } catch (error) {
    console.error("Error updating route:", error);
    return c.json<RouteResponse>(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to update route",
      },
      500
    );
  }
};

export const handleDeleteRoute = async (c: AppContext): Promise<Response> => {
  try {
    const id = Number(c.req.param("id"));

    if (isNaN(id)) {
      return c.json<RouteResponse>(
        {
          success: false,
          message: "Invalid route ID",
        },
        400
      );
    }

    const deleted = await routeService.deleteRoute(id);

    if (!deleted) {
      return c.json<RouteResponse>(
        {
          success: false,
          message: "Route not found",
        },
        404
      );
    }

    return c.json<RouteResponse>({
      success: true,
      message: "Route deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting route:", error);
    return c.json<RouteResponse>(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to delete route",
      },
      500
    );
  }
};

