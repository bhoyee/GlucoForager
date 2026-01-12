'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState({ recipes: 0 });
  const token = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;

  useEffect(() => {
    if (!token) {
      router.push('/admin');
      return;
    }
    const loadStats = async () => {
      try {
        const response = await fetch(`${API_URL}/api/admin/recipes`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.status === 401) {
          localStorage.removeItem('adminToken');
          router.push('/admin');
          return;
        }
        const data = await response.json();
        setStats({ recipes: Array.isArray(data.items) ? data.items.length : 0 });
      } catch (error) {
        setStats({ recipes: 0 });
      }
    };
    loadStats();
  }, [token]);

  return (
    <div className="admin-card">
      <h2 className="admin-title">Dashboard</h2>
      <p className="admin-subtitle">Quick overview of your recipe catalog.</p>

      <div className="admin-grid">
        <div className="admin-card">
          <h3>Total recipes</h3>
          <p style={{ fontSize: '32px', fontWeight: 700 }}>{stats.recipes}</p>
          <Link className="admin-link" href="/admin/recipes">
            Manage recipes
          </Link>
        </div>
        <div className="admin-card">
          <h3>Add a new recipe</h3>
          <p>Add breakfast, lunch, or dinner recipes for suggestions.</p>
          <Link className="admin-button" href="/admin/recipes/new">
            Create recipe
          </Link>
        </div>
      </div>
    </div>
  );
}
