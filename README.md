# 🎥 Video Tube

A scalable, production-ready Video Sharing and Social Platform Backend inspired by YouTube and Twitter, with complete functionalities like video upload, comments, likes, playlists, subscriptions, tweets, and cloud media storage.

## 🎖️ Badges

![Build](https://img.shields.io/badge/build-passing-brightgreen)  
![License](https://img.shields.io/badge/license-MIT-blue.svg)  
![Node.js](https://img.shields.io/badge/node.js-18.x-brightgreen)  
![MongoDB](https://img.shields.io/badge/database-MongoDB-green)  
![Made with Love](https://img.shields.io/badge/made%20with-%E2%9D%A4-red)

## 📋 Table of Contents

- [About the Project](#about-the-project)
- [Project Structure](#project-structure)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Setup Instructions](#setup-instructions)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [API Documentation Overview](#api-documentation-overview)
- [Contributing](#contributing)
- [License](#license)

## About the Project

**Onkar3107 Video Tube** provides a strong foundation for building video-driven social platforms.  
This backend server handles user authentication, video management, social interactions, and real-time updates efficiently using **Node.js**, **Express**, and **MongoDB**.

It is designed to be modular, secure, scalable, and ready for production.

## Project Structure

```
onkar3107-video-tube/
├── package.json                # Project dependencies and scripts
├── .prettierrc, .prettierignore # Code formatting rules
├── public/
│   └── temp/                   # Temporary storage for uploads
├── src/
│   ├── app.js                  # Express app setup
│   ├── index.js                # Server entry
│   ├── constants.js            # Global constants
│   ├── controllers/            # Route handlers
│   ├── db/                     # Database connection
│   ├── middlewares/            # Custom middlewares (Auth, Multer, etc.)
│   ├── models/                 # Mongoose schemas
│   ├── routes/                 # API routing files
│   └── utils/                  # Utility classes and helpers
```

## Features

- 🔐 **User Authentication** — JWT-based login, signup, and protected routes
- 📹 **Video Management** — Upload, stream, update, and delete videos
- 💬 **Comments System** — Add, edit, delete comments on videos
- ❤️ **Like/Dislike System** — Like videos and comments
- 📜 **Playlist Management** — Create and manage personal playlists
- 👥 **Subscriptions** — Subscribe/Unsubscribe to creators
- 🖋️ **Tweet Posting** — Post short tweets (just like Twitter!)
- 📊 **Dashboard Analytics** — Basic stats of videos, tweets, subscribers
- ☁️ **Cloudinary Storage** — Store media files securely on cloud
- 📈 **Health Monitoring** — Health check API endpoint
- 🧹 **Temp File Handling** — Safe storage for uploading media files

## Tech Stack

| Category           | Technology                 |
| ------------------ | -------------------------- |
| **Backend**        | Node.js, Express.js        |
| **Database**       | MongoDB with Mongoose ODM  |
| **Cloud Storage**  | Cloudinary API             |
| **Authentication** | JWT (JSON Web Tokens)      |
| **File Uploads**   | Multer                     |
| **Validation**     | Express-Validator          |
| **Error Handling** | Custom Error Handler Utils |
| **Formatting**     | Prettier                   |

## Setup Instructions

### Clone the Repository

```bash
git clone https://github.com/Onkar3107/video-tube.git
cd video-tube
```

### Install Dependencies

```bash
npm install
```

## Environment Variables

Create a `.env` file at the root of the project and add the following:

```dotenv
PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## Running the Application

### Development Mode (with auto-reload using nodemon)

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

Server will be accessible on:  
`http://localhost:5000/`

## API Documentation Overview

| API Module        | Endpoint Base           | Purpose                                      |
| ----------------- | ----------------------- | -------------------------------------------- |
| **Users**         | `/api/v1/users`         | User registration, login, profile update     |
| **Videos**        | `/api/v1/videos`        | Video uploading, viewing, updating, deleting |
| **Comments**      | `/api/v1/comments`      | Adding comments, fetching, deleting          |
| **Likes**         | `/api/v1/likes`         | Like and unlike operations                   |
| **Playlists**     | `/api/v1/playlists`     | Create and manage playlists                  |
| **Subscriptions** | `/api/v1/subscriptions` | Subscribe/unsubscribe to other users         |
| **Tweets**        | `/api/v1/tweets`        | Create short tweet posts                     |
| **Dashboard**     | `/api/v1/dashboard`     | View basic stats                             |
| **Healthcheck**   | `/api/v1/healthcheck`   | Check server uptime/status                   |

🔖 Full API documentation with request bodies, responses, and error examples will be available soon!

## Contributing

Want to contribute? Amazing! 🚀  
Here’s how:

1. Fork the project.
2. Create a new feature branch:

   ```bash
   git checkout -b feature/your-feature-name
   ```

3. Commit your changes:

   ```bash
   git commit -m 'Add new feature'
   ```

4. Push to your branch:

   ```bash
   git push origin feature/your-feature-name
   ```

5. Open a Pull Request and describe your changes.

**Important:**

- Write clear, meaningful commit messages.
- Format your code using Prettier (`npm run format`).
- Ensure no breaking changes are introduced.

## License

This project is licensed under the **MIT License** (see the [LICENSE](./LICENSE) file for details) — you are free to use, share, and modify it for personal or commercial use.
