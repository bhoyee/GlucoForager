import './admin.css';
import AdminShell from './ui/AdminShell';

export const metadata = {
  title: 'GlucoForager Admin',
};

export default function AdminLayout({ children }) {
  return <AdminShell>{children}</AdminShell>;
}
