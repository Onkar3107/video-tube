import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create test users
  const password = await bcrypt.hash('Password123!', 10);

  const alice = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      username: 'alice',
      email: 'alice@example.com',
      password,
      fullName: 'Alice Johnson',
      avatar: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: {
      username: 'bob',
      email: 'bob@example.com',
      password,
      fullName: 'Bob Smith',
      avatar: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    },
  });

  // Alice creates a video
  const video1 = await prisma.video.create({
    data: {
      title: 'Introduction to TypeScript',
      description: 'A comprehensive introduction to TypeScript for beginners.',
      videoFile: 'https://res.cloudinary.com/demo/video/upload/dog.mp4',
      thumbnail: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      duration: 600,
      views: 150,
      ownerId: alice.id,
      status: 'READY',
    },
  });

  // Bob subscribes to Alice
  await prisma.subscription.upsert({
    where: { subscriberId_channelId: { subscriberId: bob.id, channelId: alice.id } },
    update: {},
    create: { subscriberId: bob.id, channelId: alice.id },
  });

  // Bob comments on the video
  await prisma.comment.create({
    data: { content: 'Great video! Very helpful.', videoId: video1.id, ownerId: bob.id },
  });

  // Bob likes the video
  await prisma.like.upsert({
    where: { likedById_videoId: { likedById: bob.id, videoId: video1.id } },
    update: {},
    create: { likedById: bob.id, videoId: video1.id },
  });

  // Alice creates a tweet
  await prisma.tweet.create({
    data: { content: 'Just uploaded a new TypeScript tutorial! Check it out.', ownerId: alice.id },
  });

  // Alice creates a playlist and adds the video
  const playlist = await prisma.playlist.create({
    data: { name: 'TypeScript Series', description: 'All my TypeScript tutorials', ownerId: alice.id },
  });

  await prisma.playlistVideo.create({
    data: { playlistId: playlist.id, videoId: video1.id, position: 1 },
  });

  console.log('✅ Seed data created successfully!');
  console.log('📧 Alice credentials: alice@example.com / Password123!');
  console.log('📧 Bob credentials:   bob@example.com / Password123!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
