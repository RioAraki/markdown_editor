'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Gamepad2 } from 'lucide-react';

export function Navigation() {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Diary', icon: BookOpen, color: 'blue' },
    { href: '/steam', label: 'Steam', icon: Gamepad2, color: 'indigo' },
  ];

  return (
    <div className="fixed top-0 left-1/2 -translate-x-1/2 z-50 group">
      {/* Hover trigger area */}
      <div className="h-2 w-32 mx-auto" />
      
      {/* Navigation tabs - hidden by default, shown on hover */}
      <div className="opacity-0 -translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 ease-out">
        <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-full shadow-lg px-2 py-1.5 flex items-center space-x-1">
          {links.map(({ href, label, icon: Icon, color }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  isActive
                    ? color === 'blue'
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm'
                      : 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
