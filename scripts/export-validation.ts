import { z } from 'zod';
import { writeFileSync } from 'node:fs';
import { courseSchema, settingsSchema } from '../src/lib/schemas';
const options = { unrepresentable: 'any', cycles: 'ref', reused: 'ref' } as const;
const course = z.toJSONSchema(courseSchema, options),
  settings = z.toJSONSchema(settingsSchema, options);
writeFileSync('supabase/content.schema.json', JSON.stringify(course, null, 2));
writeFileSync('supabase/settings.schema.json', JSON.stringify(settings, null, 2));
console.log('Exported JSON Schema contracts; custom semantic checks are enforced separately.');
