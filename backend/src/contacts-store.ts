export interface StoredContact {
  name: string;
  phone: string;
}

class ContactsStore {
  private contacts: StoredContact[] = [];

  /** Replace all stored contacts (called when app syncs) */
  setContacts(contacts: StoredContact[]): void {
    this.contacts = contacts;
  }

  /** Fuzzy search by name — returns all partial matches, best first */
  lookup(query: string): StoredContact[] {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const exact: StoredContact[] = [];
    const starts: StoredContact[] = [];
    const contains: StoredContact[] = [];

    for (const c of this.contacts) {
      const n = c.name.toLowerCase();
      if (n === q)               exact.push(c);
      else if (n.startsWith(q))  starts.push(c);
      else if (n.includes(q))    contains.push(c);
    }

    return [...exact, ...starts, ...contains];
  }

  count(): number {
    return this.contacts.length;
  }
}

export const contactsStore = new ContactsStore();
