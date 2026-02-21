import './admin.css';
import AdminShell from './ui/AdminShell';

export const metadata = {
  title: 'GlucoForager Admin',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function AdminLayout({ children }) {
  return <AdminShell>{children}</AdminShell>;
}
