import mongoose, { Schema, Document } from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

export interface IUser extends Document {
  username: string;
  email: string;
  fullName: string;
  avatar: string;
  coverImage?: string;
  watcHHistory: mongoose.Types.ObjectId[];
  password: string;
  refreshToken?: string;
  verifyPassword(password: string): Promise<boolean>;
  generateAccessToken(): string;
  generateRefreshToken(): string;
}

const userSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    fullName: { type: String, required: true, trim: true, index: true },
    avatar: { type: String, required: true },
    coverImage: { type: String },
    watcHHistory: [{ type: Schema.Types.ObjectId, ref: 'Video' }],
    password: { type: String, required: [true, 'Password is required'] },
    refreshToken: { type: String },
  },
  { timestamps: true },
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.verifyPassword = async function (password: string): Promise<boolean> {
  return bcrypt.compare(password, this.password as string);
};

userSchema.methods.generateAccessToken = function (): string {
  return jwt.sign(
    { _id: this._id, email: this.email, username: this.username, fullName: this.fullName },
    process.env.ACCESS_TOKEN_SECRET as string,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY as any },
  );
};

userSchema.methods.generateRefreshToken = function (): string {
  return jwt.sign(
    { _id: this._id },
    process.env.REFRESH_TOKEN_SECRET as string,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY as any },
  );
};

export const User = mongoose.model<IUser>('User', userSchema);
