// API Response Formatting & Error Handling
// Production-grade utilities for consistent API responses

import { NextResponse, type NextRequest } from 'next/server';
import { ApiResponse, ApiError, ERROR_CODES } from '@/types/security.types';
import { ZodError } from 'zod';

/**
 * Format a successful API response
 */
export function successResponse<T>(data: T, statusCode: number = 200): NextResponse {
  const response: ApiResponse<T> = {
    success: true,
    data,
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: crypto.randomUUID(),
    },
  };

  return NextResponse.json(response, { status: statusCode });
}

/**
 * Format an error API response
 */
export function errorResponse(
  error: ApiError | Error | ZodError | unknown,
  statusCode?: number
): NextResponse {
  let apiError: ApiError;

  if (error instanceof ApiError) {
    apiError = error;
  } else if (error instanceof ZodError) {
    apiError = new ApiError(
      ERROR_CODES.VALIDATION_ERROR,
      'Validation failed',
      400,
      {
        fields: error.flatten().fieldErrors,
      }
    );
  } else if (error instanceof Error) {
    apiError = new ApiError(
      ERROR_CODES.INTERNAL_ERROR,
      error.message || 'An error occurred',
      statusCode || 500
    );
  } else {
    apiError = new ApiError(
      ERROR_CODES.INTERNAL_ERROR,
      'An unexpected error occurred',
      statusCode || 500
    );
  }

  const response: ApiResponse = {
    success: false,
    error: {
      code: apiError.code,
      message: apiError.message,
      details: apiError.details,
    },
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: crypto.randomUUID(),
    },
  };

  return NextResponse.json(response, { status: apiError.statusCode });
}

/**
 * Wrapper for API route handlers with error catching
 */
export function apiHandler(
  handler: (req: NextRequest, context: any) => Promise<NextResponse>
) {
  return async (req: NextRequest, context: any) => {
    try {
      // Log request
      console.log(`[API] ${req.method} ${req.nextUrl.pathname}`);

      return await handler(req, context);
    } catch (error) {
      console.error(`[API Error] ${req.method} ${req.nextUrl.pathname}:`, error);

      if (error instanceof ApiError) {
        return errorResponse(error, error.statusCode);
      }

      return errorResponse(error, 500);
    }
  };
}

/**
 * Validate request method
 */
export function validateMethod(req: NextRequest, allowedMethods: string[]): void {
  if (!allowedMethods.includes(req.method)) {
    throw new ApiError(
      ERROR_CODES.INTERNAL_ERROR,
      `Method ${req.method} not allowed`,
      405
    );
  }
}

/**
 * Get request body as JSON with type safety
 */
export async function getJsonBody<T>(req: NextRequest): Promise<T> {
  try {
    return await req.json();
  } catch (err) {
    throw new ApiError(
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid JSON in request body',
      400
    );
  }
}

/**
 * Get URL search parameters with parsing
 */
export function getSearchParams(req: NextRequest) {
  return {
    limit: Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50'), 1000),
    offset: Math.max(parseInt(req.nextUrl.searchParams.get('offset') || '0'), 0),
    page: Math.max(parseInt(req.nextUrl.searchParams.get('page') || '1'), 1),
    sort: req.nextUrl.searchParams.get('sort') || 'created_at',
    order: req.nextUrl.searchParams.get('order') === 'asc' ? 'asc' : 'desc',
  };
}

/**
 * Calculate pagination values
 */
export function calculatePagination(limit: number, offset: number) {
  return {
    limit,
    offset,
    page: Math.floor(offset / limit) + 1,
  };
}

/**
 * Format paginated response
 */
export function paginatedResponse<T>(
  items: T[],
  total: number,
  limit: number,
  offset: number,
  statusCode: number = 200
): NextResponse {
  const pagination = calculatePagination(limit, offset);
  const totalPages = Math.ceil(total / limit);

  const response: ApiResponse<T[]> = {
    success: true,
    data: items,
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: crypto.randomUUID(),
      pagination: {
        page: pagination.page,
        limit,
        offset,
        total,
        totalPages,
      },
    },
  };

  return NextResponse.json(response, { status: statusCode });
}
