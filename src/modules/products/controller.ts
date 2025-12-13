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
    const user = c.get("user");

    if (!user) {
      return c.json<ProductResponse>(
        {
          success: false,
          message: "Unauthorized. Please login to create products.",
        },
        401
      );
    }

    const validatedData = c.req.valid("json") as CreateProductInput;
    const newProduct = await productService.createProduct(validatedData, user.id);

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
        message: "Failed to create product",
        errors: [error instanceof Error ? error.message : "Unknown error"],
      },
      500
    );
  }
};

export const handleGetProducts = async (c: AppContext): Promise<Response> => {
  try {
    const query = c.req.valid("query") as GetProductsQuery;
    const { products, total } = await productService.getProducts(query);

    return c.json<ProductResponse>({
      success: true,
      data: products,
      meta: {
        total,
        limit: query.limit,
        offset: query.offset,
      },
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return c.json<ProductResponse>(
      {
        success: false,
        message: "Failed to fetch products",
        errors: [error instanceof Error ? error.message : "Unknown error"],
      },
      500
    );
  }
};

export const handleGetProductById = async (c: AppContext): Promise<Response> => {
  try {
    const { id } = c.req.param();
    const productId = Number(id);

    if (isNaN(productId)) {
      return c.json<ProductResponse>(
        {
          success: false,
          message: "Invalid product ID",
        },
        400
      );
    }

    const product = await productService.getProductById(productId);

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
        errors: [error instanceof Error ? error.message : "Unknown error"],
      },
      500
    );
  }
};

export const handleUpdateProduct = async (c: AppContext): Promise<Response> => {
  try {
    const user = c.get("user");

    if (!user) {
      return c.json<ProductResponse>(
        {
          success: false,
          message: "Unauthorized. Please login to update products.",
        },
        401
      );
    }

    const { id } = c.req.param();
    const productId = Number(id);

    if (isNaN(productId)) {
      return c.json<ProductResponse>(
        {
          success: false,
          message: "Invalid product ID",
        },
        400
      );
    }

    const validatedData = c.req.valid("json") as UpdateProductInput;
    const updatedProduct = await productService.updateProduct(productId, validatedData);

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
      message: "Product updated successfully",
    });
  } catch (error) {
    console.error("Error updating product:", error);
    return c.json<ProductResponse>(
      {
        success: false,
        message: "Failed to update product",
        errors: [error instanceof Error ? error.message : "Unknown error"],
      },
      500
    );
  }
};

export const handleDeleteProduct = async (c: AppContext): Promise<Response> => {
  try {
    const user = c.get("user");

    if (!user) {
      return c.json<ProductResponse>(
        {
          success: false,
          message: "Unauthorized. Please login to delete products.",
        },
        401
      );
    }

    const { id } = c.req.param();
    const productId = Number(id);

    if (isNaN(productId)) {
      return c.json<ProductResponse>(
        {
          success: false,
          message: "Invalid product ID",
        },
        400
      );
    }

    const deleted = await productService.deleteProduct(productId);

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
        message: "Failed to delete product",
        errors: [error instanceof Error ? error.message : "Unknown error"],
      },
      500
    );
  }
};

export const handleUpdateQuantity = async (c: AppContext): Promise<Response> => {
  try {
    const user = c.get("user");

    if (!user) {
      return c.json<ProductResponse>(
        {
          success: false,
          message: "Unauthorized. Please login to update quantity.",
        },
        401
      );
    }

    const { id } = c.req.param();
    const productId = Number(id);

    if (isNaN(productId)) {
      return c.json<ProductResponse>(
        {
          success: false,
          message: "Invalid product ID",
        },
        400
      );
    }

    const { quantity } = await c.req.json<{ quantity: number }>();

    const updatedProduct = await productService.updateProductQuantity(productId, quantity);

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
        message: "Failed to update product quantity",
        errors: [error instanceof Error ? error.message : "Unknown error"],
      },
      500
    );
  }
};

