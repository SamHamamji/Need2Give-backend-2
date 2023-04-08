import z from 'zod';
import idSchema from './id';

/**
 * These values should only be used for migrations and seeds, keep in mind
 * that they are not final since item categories can be added or removed in
 * the database
 */
enum ItemCategories {
  food = 'food',
  medication = 'medication',
  clothes = 'clothes',
  other = 'other',
}

const itemCategorySchema = z.object({
  id: idSchema,
  name: z.string().min(2).max(64),
}).strict();
type ItemCategorySchema = z.infer<typeof itemCategorySchema>;

export { ItemCategorySchema, itemCategorySchema, ItemCategories };