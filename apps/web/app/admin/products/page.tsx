import { redirect } from 'next/navigation';

export default function ProductsRedirect() {
  redirect('/admin?tab=products');
}
