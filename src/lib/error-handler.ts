/**
 * Error handling utilities for converting database errors to user-friendly messages
 */

/**
 * Extracts error information from various error formats.
 * Drizzle wraps PostgreSQL errors in DrizzleQueryError which contains nested error info.
 */
function extractErrorInfo(error: unknown): string {
    if (!error) return "";

    // Try to stringify the entire error to capture nested properties
    let fullErrorString = "";
    try {
        fullErrorString = JSON.stringify(error, Object.getOwnPropertyNames(error)).toLowerCase();
    } catch {
        fullErrorString = String(error).toLowerCase();
    }

    // Also get the message if it's an Error
    if (error instanceof Error) {
        fullErrorString += " " + error.message.toLowerCase();

        // Check for cause (Drizzle wraps errors with cause)
        const cause = (error as any).cause;
        if (cause) {
            try {
                fullErrorString += " " + JSON.stringify(cause, Object.getOwnPropertyNames(cause)).toLowerCase();
            } catch {
                fullErrorString += " " + String(cause).toLowerCase();
            }
        }
    }

    return fullErrorString;
}

/**
 * Maps PostgreSQL error codes and patterns to user-friendly messages.
 * This prevents raw database error messages from being exposed to users.
 * 
 * @param error - The error caught from database operations
 * @param entityName - Human-readable name of the entity (e.g., "DSR", "brand", "category")
 * @returns A user-friendly error message
 */
export function formatDatabaseError(error: unknown, entityName: string = "item"): string {
    const errorInfo = extractErrorInfo(error);

    // Unique constraint violation (duplicate entry) - PostgreSQL error code: 23505
    if (errorInfo.includes("duplicate key") ||
        errorInfo.includes("unique constraint") ||
        errorInfo.includes("unique_violation") ||
        errorInfo.includes("23505") ||
        errorInfo.includes("_unique")) {

        if (errorInfo.includes("abbreviation")) {
            return `A ${entityName} with this abbreviation already exists`;
        }
        if (errorInfo.includes("name")) {
            return `A ${entityName} with this name already exists`;
        }
        if (errorInfo.includes("email")) {
            return `This email is already in use`;
        }
        if (errorInfo.includes("phone")) {
            return `This phone number is already in use`;
        }
        return `This ${entityName} already exists`;
    }

    // Foreign key constraint - PostgreSQL error code: 23503
    if (errorInfo.includes("foreign key constraint") ||
        errorInfo.includes("fk_") ||
        errorInfo.includes("references") ||
        errorInfo.includes("23503")) {

        if (errorInfo.includes("delete") || errorInfo.includes("update or delete")) {
            return `Cannot delete this ${entityName} because it is being used by other records`;
        }
        if (errorInfo.includes("insert") || errorInfo.includes("update")) {
            return `The referenced record does not exist`;
        }
        return `This operation cannot be completed due to related data`;
    }

    // Not null constraint violation - PostgreSQL error code: 23502
    if (errorInfo.includes("not-null constraint") ||
        errorInfo.includes("null value") ||
        errorInfo.includes("violates not-null") ||
        errorInfo.includes("23502")) {
        return `A required field is missing`;
    }

    // Check constraint violation - PostgreSQL error code: 23514
    if (errorInfo.includes("check constraint") ||
        errorInfo.includes("violates check") ||
        errorInfo.includes("23514")) {
        return `The provided value is not valid`;
    }

    // Connection/timeout errors
    if (errorInfo.includes("connection") ||
        errorInfo.includes("timeout") ||
        errorInfo.includes("econnrefused")) {
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
    const errorInfo = extractErrorInfo(error);
    return errorInfo.includes("not found") || errorInfo.includes("no rows");
}

/**
 * Helper to determine if an error is a duplicate/conflict error
 */
export function isDuplicateError(error: unknown): boolean {
    const errorInfo = extractErrorInfo(error);
    return errorInfo.includes("duplicate") || errorInfo.includes("unique constraint") || errorInfo.includes("already exists") || errorInfo.includes("23505");
}
