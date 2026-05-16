import { v4 as uuidv4 } from 'uuid';
import { getItem, putItem, scanTable } from '../lib/dynamo';
import { ok, error, notFound } from '../lib/response';
import { Course } from '../types';

const TABLE = process.env.COURSES_TABLE!;
const API_KEY = process.env.GOLF_COURSE_API_KEY!;
const BASE_URL = 'https://api.golfcourseapi.com/v1';

export async function listCourses() {
  const courses = await scanTable<Course>(TABLE);
  courses.sort((a, b) => a.name.localeCompare(b.name));
  return ok(courses);
}

export async function getCourse(id: string) {
  const course = await getItem<Course>(TABLE, id);
  if (!course) return notFound('Course');
  return ok(course);
}

function apiHeaders() {
  return { 'Authorization': `Key ${API_KEY}` };
}

export async function searchCourses(query: string) {
  if (!query || query.length < 2) return error('Query must be at least 2 characters');
  try {
    const url = `${BASE_URL}/courses?search=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: apiHeaders() });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const data = await res.json() as any;
    return ok(data);
  } catch (e: any) {
    return error(`Course search failed: ${e.message}`, 500);
  }
}

export async function getCourseFromApi(apiId: string) {
  try {
    const url = `${BASE_URL}/courses/${apiId}`;
    const res = await fetch(url, { headers: apiHeaders() });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const data = await res.json() as any;
    return ok(data);
  } catch (e: any) {
    return error(`Course lookup failed: ${e.message}`, 500);
  }
}

export async function saveCourse(body: Partial<Course>) {
  if (!body.name) return error('Course name is required');

  const now = new Date().toISOString();
  const course: Course = {
    id: body.id ?? uuidv4(),
    name: body.name.trim(),
    city: body.city,
    state: body.state,
    country: body.country,
    holes: body.holes ?? [],
    tees: body.tees ?? [],
    savedAt: now,
  };

  await putItem(TABLE, course);
  return ok(course, 201);
}
