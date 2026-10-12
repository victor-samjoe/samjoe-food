import { redirect } from 'next/navigation';

export default function DeliveriesRedirect() {
  redirect('/admin?tab=deliveries');
}
