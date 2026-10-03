# Club Bonus Ball — TEST Lotto Server

This is the server-side layer for automatic UK Lotto results.

## Endpoint
GET `/api/test/lotto/latest`

The server:
1. Tries the National Lottery operator's Lotto draw-history page first.
2. Reads Saturday Round 1 only.
3. Requires exactly six unique main numbers (1–59).
4. Ignores Bonus Ball and Round 2.
5. If the operator page is unavailable, uses the independent lottery.co.uk results page as a TEST fallback and marks `verifiedAgainstOfficial:false`.
6. The Android app must still show the retrieved numbers for organiser confirmation before saving.

## Render
Create a Web Service from this folder/repository.
- Build command: `npm install`
- Start command: `npm start`
- Environment: TEST

After deployment, test:
`https://YOUR-SERVER.onrender.com/health`

Then:
`https://YOUR-SERVER.onrender.com/api/test/lotto/latest`
