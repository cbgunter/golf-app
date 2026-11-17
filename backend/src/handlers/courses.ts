import { v4 as uuidv4 } from 'uuid';
import { getItem, putItem, scanTable } from '../lib/dynamo';
import { ok, error, notFound } from '../lib/response';
import { Course } from '../types';
import { getGhinClient, resetGhinClient } from '../lib/ghinClient';

const TABLE = process.env.COURSES_TABLE!;

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

export async function searchCourses(query: string) {
  if (!query || query.length < 2) return error('Query must be at least 2 characters');
  try {
    const client = await getGhinClient();
    const courses = await client.courses.search({ name: query });
    return ok({ courses: courses ?? [] });
  } catch (e: any) {
    resetGhinClient(); // re-authenticate on next call
    return error(`Course search failed: ${e.message}`, 500);
  }
}

export async function getCourseFromApi(courseId: string) {
  try {
    const client = await getGhinClient();
    const details = await client.courses.getDetails({ course_id: Number(courseId) });
    return ok({ course: details });
  } catch (e: any) {
    resetGhinClient();
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
