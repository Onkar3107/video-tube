import type { Request, Response } from 'express';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const healthCheck = asyncHandler(async (req: Request, res: Response) => {
  res
    .status(200)
    .json(new ApiResponse(200, {}, 'Health is great. Everything OK.'));
});

export { healthCheck };
