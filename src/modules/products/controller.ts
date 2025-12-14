import type { Context } from "hono";
import type { CreateProductInput, UpdateProductInput, GetProductsQuery } from "./validation";
import type { ProductResponse } from "./types";
import * as productService from "./service";

type AppContext = Context<{
  Variables: {
    user: { id: string; email: string } | null;
    session: any | null;
  };
}, any, {
  in: {
    json?: CreateProductInput | UpdateProductInput;
    query?: GetProductsQuery;
  };
  out: {
    json?: CreateProductInput | UpdateProductInput;
    query?: GetProductsQuery;
  };
}>;

export const handleCreateProduct = async (c: AppContext): Promise<Response> => {
  try {
    const validatedData = c.req.valid("json") as CreateProductInput;
    const newProduct = await productService.createProduct(validatedData);

    return c.json<ProductResponse>(
      {
        success: true,
        data: newProduct,
        message: "Product created successfully",
      },
      201
    );
  } catch (error) {
    console.error("Error creating product:", error);
    return c.json<ProductResponse>(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to create product",
      },
      500
    );
  }
};

export const handleGetProducts = async (c: AppContext): Promise<Response> => {
  try {
    const validatedQuery = c.req.valid("query") as GetProductsQuery;
    const { products, total } = await productService.getProducts(validatedQuery);

    return c.json<ProductResponse>({
      success: true,
      data: products,
      total,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return c.json<ProductResponse>(
      {
        success: false,
        message: "Failed to fetch products",
      },
      500
    );
  }
};

export const handleGetProductById = async (c: AppContext): Promise<Response> => {
  try {
    const id = Number(c.req.param("id"));

    if (isNaN(id)) {
      return c.json<ProductResponse>(
        {
          success: false,
          message: "Invalid product ID",
        },
        400
      );
    }

    const product = await productService.getProductById(id);

    if (!product) {
      return c.json<ProductResponse>(
        {
          success: false,
          message: "Product not found",
        },
        404
      );
    }

    return c.json<ProductResponse>({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    return c.json<ProductResponse>(
      {
        success: false,
        message: "Failed to fetch product",
      },
      500
    );
  }
};

export const handleUpdateProduct = async (c: AppContext): Promise<Response> => {
  try {
    console.log("=== UPDATE PRODUCT CONTROLLER ===");
    const id = Number(c.req.param("id"));
    console.log("Product ID from URL:", id);

    if (isNaN(id)) {
      console.log("Invalid product ID");
      return c.json<ProductResponse>(
        {
          success: false,
          message: "Invalid product ID",
        },
        400
      );
    }

    const rawBody = await c.req.json();
    console.log("Raw request body:", JSON.stringify(rawBody, null, 2));

    const validatedData = c.req.valid("json") as UpdateProductInput;
    console.log("Validated data:", JSON.stringify(validatedData, null, 2));

    const updatedProduct = await productService.updateProduct(id, validatedData);
    console.log("Update result:", updatedProduct ? "Success" : "Not found");

    if (!updatedProduct) {
      console.log("Product not found with ID:", id);
      return c.json<ProductResponse>(
        {
          success: false,
          message: "Product not found",
        },
        404
      );
    }

    console.log("Returning success response");
    console.log("=== END UPDATE PRODUCT CONTROLLER ===");
    return c.json<ProductResponse>({
      success: true,
      data: updatedProduct,
      message: "Product updated successfully",
    });
  } catch (error) {
    console.error("=== UPDATE PRODUCT ERROR ===");
    console.error("Error updating product:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
    return c.json<ProductResponse>(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to update product",
      },
      500
    );
  }
};

export const handleDeleteProduct = async (c: AppContext): Promise<Response> => {
  try {
    const id = Number(c.req.param("id"));

    if (isNaN(id)) {
      return c.json<ProductResponse>(
        {
          success: false,
          message: "Invalid product ID",
        },
        400
      );
    }

    const deleted = await productService.deleteProduct(id);

    if (!deleted) {
      return c.json<ProductResponse>(
        {
          success: false,
          message: "Product not found",
        },
        404
      );
    }

    return c.json<ProductResponse>({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    return c.json<ProductResponse>(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to delete product",
      },
      500
    );
  }
};

export const handleUpdateQuantity = async (c: AppContext): Promise<Response> => {
  try {
    const id = Number(c.req.param("id"));

    if (isNaN(id)) {
      return c.json<ProductResponse>(
        {
          success: false,
          message: "Invalid product ID",
        },
        400
      );
    }

    const { quantity } = await c.req.json<{ quantity: number }>();

    const updatedProduct = await productService.updateProductQuantity(id, quantity);

    if (!updatedProduct) {
      return c.json<ProductResponse>(
        {
          success: false,
          message: "Product not found",
        },
        404
      );
    }

    return c.json<ProductResponse>({
      success: true,
      data: updatedProduct,
      message: "Product quantity updated successfully",
    });
  } catch (error) {
    console.error("Error updating product quantity:", error);
    return c.json<ProductResponse>(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to update product quantity",
      },
      500
    );
  }
};

