# WebSocket & Notifications Manual Testing Steps (Postman)

This guide walks you through verifying WebSocket connections, heartbeat events, progress streaming, and real-time notification push using Postman.

---

## Prerequisites
1. Open **Postman** (v10+ recommended for full WebSocket request support).
2. Start the API server locally:
   ```bash
   npm run dev
   ```
3. Start the background worker process:
   ```bash
   npm run worker
   ```

---

## Step 1: Obtain a Valid JWT Access Token
1. In Postman, create a standard HTTP `POST` request to log in:
   * **URL:** `http://localhost:8000/api/v1/users/login`
   * **Headers:** `Content-Type: application/json`
   * **Body (raw JSON):**
     ```json
     {
       "username": "three",
       "password": "12345678"
     }
     ```
2. Send the request and copy the `accessToken` from the JSON response (`data.accessToken`).

---

## Step 2: Connect to WebSocket Server in Postman
1. In Postman, click **New** -> **WebSocket**.
2. Set the connection URL:
   * **URL:** `ws://localhost:8000?token=<PASTE_JWT_ACCESS_TOKEN_HERE>`
3. Click **Connect**.
4. **Expected Result:**
   * Postman logs a successful connection.
   * You will receive a connection acknowledgement frame from the server:
     ```json
     {
       "type": "connection_ack",
       "payload": {
         "userId": "...",
         "connectionId": "..."
       }
     }
     ```

---

## Step 3: Verify the Heartbeat (Ping-Pong)
1. Keep the connection open.
2. Every 30 seconds, the server will automatically push a ping request:
   ```json
   { "type": "ping" }
   ```
3. To prevent the server from terminating the connection, you must respond to the server's ping. Under the **Message** input box in Postman, type:
   ```json
   { "type": "pong" }
   ```
4. Click **Send** to deliver it back to the server. If you don't respond with a pong within 10 seconds, the server logs will show `"WebSocket: terminating dead connection (no heartbeat response)"` and the socket will close.

---

## Step 4: Test Video Processing & Progress Streaming
1. Open a new Postman HTTP tab.
2. Set up a `POST` request to publish a video:
   * **URL:** `http://localhost:8000/api/v1/videos`
   * **Headers:** `Authorization: Bearer <PASTE_JWT_ACCESS_TOKEN_HERE>`
   * **Body (form-data):**
     * `title`: `My Test Video`
     * `description`: `Background upload test`
     * `videoFile`: (Select a short `.mp4` file)
     * `thumbnail`: (Select a `.jpg` image)
3. Send the request.
4. **Expected HTTP Response:**
   * Status code `202 Accepted` immediately returned (< 100ms).
   * JSON payload: `{ "success": true, "data": { "videoId": "...", "jobId": "...", "status": "UPLOADING" } }`
5. **Expected WebSocket Events (in your open WebSocket tab):**
   * Almost instantly, you will receive processing progress packets as the worker runs:
     ```json
     {
       "type": "video:active",
       "payload": {
         "videoId": "...",
         "jobId": "...",
         "progress": 20,
         "stage": "PROCESSING",
         "status": "active"
       }
     }
     ```
     ```json
     {
       "type": "video:active",
       "payload": {
         "videoId": "...",
         "jobId": "...",
         "progress": 50,
         "stage": "UPLOADING_THUMBNAIL",
         "status": "active"
       }
     }
     ```
   * Once finished uploading to Cloudinary:
     ```json
     {
       "type": "video:completed",
       "payload": {
         "videoId": "...",
         "duration": 15.2
       }
     }
     ```

---

## Step 5: Verify Live Notification Push
1. Open a second Postman WebSocket tab.
2. Obtain a JWT token for a **second user** (who is subscribed to the first user "three").
3. Connect the second user's WebSocket using:
   `ws://localhost:8000?token=<SECOND_USER_JWT_TOKEN>`
4. Publish a video using the first user's token (same as Step 4).
5. **Expected Result:**
   * The second user's WebSocket console will receive a live notification packet:
     ```json
     {
       "type": "notification",
       "payload": {
         "id": "...",
         "type": "new_video",
         "message": "three uploaded a new video",
         "payload": {
           "videoId": "...",
           "channelName": "three",
           "message": "three uploaded a new video"
         },
         "createdAt": "..."
       }
     }
     ```

---

## Step 6: Test Notification REST Endpoints
1. Set up an HTTP `GET` request in Postman:
   * **URL:** `http://localhost:8000/api/v1/notifications`
   * **Headers:** `Authorization: Bearer <SECOND_USER_JWT_TOKEN>`
   * **Expected Response:** `200 OK` listing the notifications inbox and the `unreadCount`.
2. Set up a `PATCH` request to mark a notification as read:
   * **URL:** `http://localhost:8000/api/v1/notifications/<NOTIFICATION_ID>/read`
   * **Headers:** `Authorization: Bearer <SECOND_USER_JWT_TOKEN>`
   * **Expected Response:** `200 OK` marking the item as read.
3. Verify via `GET` that the `unreadCount` decrements.
