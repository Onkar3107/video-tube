import mongoose, { Schema, Document } from 'mongoose';

export interface ITweet extends Document {
  content: string;
  owner: mongoose.Types.ObjectId;
}

const tweetSchema = new Schema<ITweet>(
  {
    content: { type: String, required: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const Tweet = mongoose.model<ITweet>('Tweet', tweetSchema);
