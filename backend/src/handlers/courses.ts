import { v4 as uuidv4 } from 'uuid';
import { getItem, putItem, scanTable } from '../lib/dynamo';
import { ok, error, notFound } from '../lib/response';
import { Course } from '../types';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { GhinClient } from '@spicygolf/ghin';

const TABLE = process.env.COURSES_TABLE!;
const ssmClient = new SSMClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

let ghinClient: GhinClient | null = null;

async function getSSMParam(name: string): Promise<string> {
  const res = await ssmClient.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  return res.Parameter?.Value ?? '';
}

async function getGhinClient(): Promise<GhinClient> {
  if (ghinClient) return ghinClient;
  const [username, password] = await Promise.all([
    getSSMParam(process.env.GHIN_USERNAME_PARAM!),
    getSSMParam(process.env.GHIN_PASSWORD_PARAM!),
  ]);
  ghinClient = new GhinClient({ username, password });
  return ghinClient;
}

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
    ghinClient = null; // reset on auth failure so next call re-authenticates
    return error(`Course search failed: ${e.message}`, 500);
  }
}

export async function getCourseFromApi(courseId: string) {
  try {
    const client = await getGhinClient();
    const details = await client.courses.getDetails({ course_id: Number(courseId) });
    return ok({ course: details });
  } catch (e: any) {
    ghinClient = null;
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
