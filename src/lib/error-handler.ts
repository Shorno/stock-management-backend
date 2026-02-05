/**
 * Error handling utilities for converting database errors to user-friendly messages
 */

/**
 * Maps PostgreSQL error codes and patterns to user-friendly messages.
 * This prevents raw database error messages from being exposed to users.
 * 
 * @param error - The error caught from database operations
 * @param entityName - Human-readable name of the entity (e.g., "DSR", "brand", "category")
 * @returns A user-friendly error message
 */
export function formatDatabaseError(error: unknown, entityName: string = "item"): string {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    // Unique constraint violation (duplicate entry)
    if (message.includes("duplicate key") || message.includes("unique constraint") || message.includes("unique_violation")) {
        if (message.includes("name")) {
            return `A ${entityName} with this name already exists`;
        }
        if (message.includes("email")) {
            return `This email is already in use`;
        }
        if (message.includes("phone")) {
            return `This phone number is already in use`;
        }
        return `This ${entityName} already exists`;
    }

    // Foreign key constraint - trying to delete/update a record referenced by other records
    if (message.includes("foreign key constraint") || message.includes("fk_") || message.includes("references")) {
        if (message.includes("delete") || message.includes("update or delete")) {
            return `Cannot delete this ${entityName} because it is being used by other records`;
        }
        if (message.includes("insert") || message.includes("update")) {
            return `The referenced record does not exist`;
        }
        return `This operation cannot be completed due to related data`;
    }

    // Not null constraint violation
    if (message.includes("not-null constraint") || message.includes("null value") || message.includes("violates not-null")) {
        return `A required field is missing`;
    }

    // Check constraint violation
    if (message.includes("check constraint") || message.includes("violates check")) {
        return `The provided value is not valid`;
    }

    // Connection/timeout errors
    if (message.includes("connection") || message.includes("timeout") || message.includes("econnrefused")) {
        return `Database connection error. Please try again later`;
    }

    // Generic fallback - don't expose raw database error details
    console.error(`Unhandled database error for ${entityName}:`, error);
    return `Failed to process ${entityName}. Please try again`;
}

/**
 * Helper to determine if an error is a "not found" type error
 */
export function isNotFoundError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return message.includes("not found") || message.includes("no rows");
}

/**
 * Helper to determine if an error is a duplicate/conflict error
 */
export function isDuplicateError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return message.includes("duplicate") || message.includes("unique constraint") || message.includes("already exists");
}
