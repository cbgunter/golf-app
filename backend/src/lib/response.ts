export function ok(body: unknown, statusCode = 200) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function error(message: string, statusCode = 400) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message }),
  };
}

export function unauthorized() {
  return error('Unauthorized', 401);
}

export function notFound(resource = 'Resource') {
  return error(`${resource} not found`, 404);
}
