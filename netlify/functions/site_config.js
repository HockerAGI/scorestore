exports.handler = async () => {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      stripe_pk: process.env.STRIPE_PUBLISHABLE_KEY || ""
    })
  };
};
