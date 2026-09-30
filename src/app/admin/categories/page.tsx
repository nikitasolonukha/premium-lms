export const metadata = { title: 'Категории' };
import { requireActor } from '@/lib/server/auth';
import { getCategories } from '@/lib/server/data';
import { PageHeading } from '@/components/ui';
import { CategoriesManager } from '@/components/categories-manager';
export default async function Categories() {
  await requireActor('admin');
  const categories = await getCategories();
  return (
    <>
      <PageHeading
        eyebrow="ОРГАНИЗАЦИЯ КОНТЕНТА"
        title="Категории"
        description="Помогайте ученикам ориентироваться в направлениях обучения."
      />
      <CategoriesManager categories={categories} />
    </>
  );
}
