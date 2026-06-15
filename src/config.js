export const config = {
  paddle: {
    apiKey: process.env.PADDLE_API_KEY || '',
    priceId: process.env.PADDLE_PRICE_ID || '',
    clientToken: process.env.PADDLE_CLIENT_TOKEN || '',
  },
};
