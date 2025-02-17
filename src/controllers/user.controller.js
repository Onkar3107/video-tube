import {AsyncHandler} from '../utils/wrapAsync.js';

export const registerUser = AsyncHandler(async (req, res) => {
    res.status(200).json({
        message : 'Register user\nLucifer',
    })
});