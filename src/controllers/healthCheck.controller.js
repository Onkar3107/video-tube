import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { AsyncHandler } from "../utils/wrapAsync.js";

const healthCheck = AsyncHandler(async (req, res) => {
  //TODO: build a healthCheck response that simply returns the OK status as json with a message

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {},
        "Health is great. Everything OK."
      )
    )

});

export { healthCheck };
