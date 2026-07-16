import mongoose, { Schema, Document } from 'mongoose';
import mongooseAggregatePaginate from 'mongoose-aggregate-paginate-v2';

export interface IComment extends Document {
  content: string;
  video: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
}

const commentSchema = new Schema<IComment>(
  {
    content: { type: String, required: true },
    video: { type: Schema.Types.ObjectId, ref: 'Video' },
    owner: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

commentSchema.plugin(mongooseAggregatePaginate);

export const Comment = mongoose.model<IComment>('Comment', commentSchema);
