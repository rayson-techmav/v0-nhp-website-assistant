export async function GET() {
  const firstName = process.env.CUSTOMER_FIRST_NAME || ''

  return Response.json({
    firstName,
  })
}
