import { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export function registerSupportTicketsRoutes(app: FastifyInstance, database: Database.Database): void {
  function formatTicket(t: any) {
    if (!t) return t;
    return {
      id: t.id,
      ticketRef: t.ticketRef || t.ticket_ref,
      referenceNo: t.ticketRef || t.ticket_ref,
      userId: t.userId || t.user_id,
      userName: t.userUsername || t.userName,
      userDisplayName: t.userDisplayName,
      title: t.title,
      subject: t.title,
      description: t.description,
      message: t.description,
      category: t.category,
      priority: t.priority,
      status: t.status,
      assignedAdminId: t.assignedAdminId || t.assigned_admin_id,
      createdAt: t.createdAt || t.created_at,
      updatedAt: t.updatedAt || t.updated_at,
      replyCount: t.replyCount ?? 0,
      repliesCount: t.replyCount ?? 0,
    };
  }

  function formatReply(r: any) {
    if (!r) return r;
    return {
      id: r.id,
      ticketId: r.ticketId || r.ticket_id,
      userId: r.authorId || r.author_id,
      authorId: r.authorId || r.author_id,
      userRole: r.authorRole || r.author_role,
      authorRole: r.authorRole || r.author_role,
      userName: r.authorUsername || r.userName,
      userDisplayName: r.authorDisplayName || r.userDisplayName,
      message: r.message,
      attachmentFileIds: r.attachmentFileIds || [],
      createdAt: r.createdAt || r.created_at,
    };
  }

  // GET /api/support-tickets & GET /api/support/tickets
  const listTicketsHandler = async (request: any, reply: any) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const user = database.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
    const isAdmin = user?.role === 'admin';

    const statusFilter = request.query.status;

    let sql = isAdmin
      ? `
        SELECT t.id, t.ticket_ref AS ticketRef, t.user_id AS userId,
               u.username AS userUsername, u.display_name AS userDisplayName,
               t.title, t.description, t.category, t.priority, t.status,
               t.assigned_admin_id AS assignedAdminId,
               t.created_at AS createdAt, t.updated_at AS updatedAt,
               (SELECT COUNT(*) FROM support_ticket_replies r WHERE r.ticket_id = t.id) AS replyCount
        FROM support_tickets t
        JOIN users u ON u.id = t.user_id
        ${statusFilter ? 'WHERE t.status = ?' : ''}
        ORDER BY t.created_at DESC
      `
      : `
        SELECT t.id, t.ticket_ref AS ticketRef, t.user_id AS userId,
               t.title, t.description, t.category, t.priority, t.status,
               t.assigned_admin_id AS assignedAdminId,
               t.created_at AS createdAt, t.updated_at AS updatedAt,
               (SELECT COUNT(*) FROM support_ticket_replies r WHERE r.ticket_id = t.id) AS replyCount
        FROM support_tickets t
        WHERE t.user_id = ? ${statusFilter ? 'AND t.status = ?' : ''}
        ORDER BY t.created_at DESC
      `;

    let params: any[] = [];
    if (isAdmin) {
      params = statusFilter ? [statusFilter] : [];
    } else {
      params = statusFilter ? [userId, statusFilter] : [userId];
    }

    const rows = database.prepare(sql).all(...params) as any[];
    const tickets = rows.map(formatTicket);

    return { tickets };
  };

  app.get('/api/support/tickets', listTicketsHandler);
  app.get('/api/support-tickets', listTicketsHandler);

  // POST /api/support-tickets & POST /api/support/tickets
  const createTicketHandler = async (request: any, reply: any) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const body = request.body || {};
    const title = (body.title || body.subject || '').trim();
    const description = (body.description || body.message || '').trim();
    const category = body.category || 'general';
    const priority = body.priority || 'normal';

    if (!title) return reply.code(400).send({ error: 'กรุณาระบุหัวข้อปัญหา' });
    if (!description) return reply.code(400).send({ error: 'กรุณาระบุรายละเอียด' });

    const id = randomUUID();
    const countRow = database.prepare('SELECT COUNT(*) AS total FROM support_tickets').get() as { total: number };
    const ticketRef = `#TK-${1001 + countRow.total}`;
    const now = Date.now();

    database.prepare(`
      INSERT INTO support_tickets (id, ticket_ref, user_id, title, description, category, priority, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
    `).run(id, ticketRef, userId, title, description, category, priority, now, now);

    const createdTicket = formatTicket({
      id,
      ticketRef,
      userId,
      title,
      description,
      category,
      priority,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      replyCount: 0,
    });

    return reply.code(201).send({
      ok: true,
      ticket: createdTicket,
      ...createdTicket,
    });
  };

  app.post('/api/support/tickets', createTicketHandler);
  app.post('/api/support-tickets', createTicketHandler);

  // GET /api/support-tickets/:id & GET /api/support/tickets/:id
  const getTicketHandler = async (request: any, reply: any) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const user = database.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
    const isAdmin = user?.role === 'admin';

    const row = database.prepare(`
      SELECT t.id, t.ticket_ref AS ticketRef, t.user_id AS userId,
             u.username AS userUsername, u.display_name AS userDisplayName,
             t.title, t.description, t.category, t.priority, t.status,
             t.assigned_admin_id AS assignedAdminId,
             t.created_at AS createdAt, t.updated_at AS updatedAt
      FROM support_tickets t
      JOIN users u ON u.id = t.user_id
      WHERE t.id = ?
    `).get(request.params.id) as any;

    if (!row) return reply.code(404).send({ error: 'ไม่พบเรื่องติดต่อ' });

    if (!isAdmin && row.userId !== userId) {
      return reply.code(404).send({ error: 'ไม่พบเรื่องติดต่อ' });
    }

    const replyRows = database.prepare(`
      SELECT r.id, r.ticket_id AS ticketId, r.author_id AS authorId,
             r.author_role AS authorRole, r.message, r.attachment_file_ids AS attachmentFileIds,
             r.created_at AS createdAt,
             u.username AS authorUsername, u.display_name AS authorDisplayName
      FROM support_ticket_replies r
      JOIN users u ON u.id = r.author_id
      WHERE r.ticket_id = ?
      ORDER BY r.created_at ASC
    `).all(row.id) as any[];

    const replies = replyRows.map((r) => {
      let files = [];
      try {
        files = JSON.parse(r.attachmentFileIds || '[]');
      } catch {
        files = [];
      }
      return formatReply({ ...r, attachmentFileIds: files });
    });

    const ticket = formatTicket(row);
    return { ticket, replies };
  };

  app.get('/api/support/tickets/:id', getTicketHandler);
  app.get('/api/support-tickets/:id', getTicketHandler);

  // POST /api/support-tickets/:id/replies & POST /api/support/tickets/:id/replies
  const postReplyHandler = async (request: any, reply: any) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const user = database.prepare('SELECT role, username, display_name FROM users WHERE id = ?').get(userId) as {
      role: string;
      username: string;
      display_name: string;
    } | undefined;
    const isAdmin = user?.role === 'admin';

    const ticket = database.prepare('SELECT * FROM support_tickets WHERE id = ?').get(request.params.id) as any;
    if (!ticket) return reply.code(404).send({ error: 'ไม่พบเรื่องติดต่อ' });

    if (!isAdmin && ticket.user_id !== userId) {
      return reply.code(404).send({ error: 'ไม่พบเรื่องติดต่อ' });
    }

    const { message, attachmentFileIds = [] } = request.body || {};
    if (!message || !message.trim()) {
      return reply.code(400).send({ error: 'กรุณาระบุข้อความตอบกลับ' });
    }

    const replyId = randomUUID();
    const now = Date.now();
    const filesJson = JSON.stringify(attachmentFileIds);

    database.prepare(`
      INSERT INTO support_ticket_replies (id, ticket_id, author_id, author_role, message, attachment_file_ids, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(replyId, ticket.id, userId, isAdmin ? 'admin' : 'user', message.trim(), filesJson, now);

    database.prepare('UPDATE support_tickets SET updated_at = ? WHERE id = ?').run(now, ticket.id);

    // If admin replies, notify the ticket owner
    if (isAdmin && ticket.user_id !== userId) {
      const notifId = randomUUID();
      const notifTitle = `💬 แอดมินตอบกลับเรื่องติดต่อ: ${ticket.ticket_ref}`;
      const notifMsg = message.trim().slice(0, 150) + (message.length > 150 ? '...' : '');
      const linkUrl = `/help-support?ticketId=${ticket.id}`;

      database.prepare(`
        INSERT INTO notifications (id, user_id, type, title, message, link_url, is_read, created_at)
        VALUES (?, ?, 'support_ticket', ?, ?, ?, 0, ?)
      `).run(notifId, ticket.user_id, notifTitle, notifMsg, linkUrl, now);
    }

    const createdReply = formatReply({
      id: replyId,
      ticketId: ticket.id,
      authorId: userId,
      authorRole: isAdmin ? 'admin' : 'user',
      authorUsername: user?.username,
      authorDisplayName: user?.display_name,
      message: message.trim(),
      attachmentFileIds,
      createdAt: now,
    });

    return reply.code(201).send({
      ok: true,
      reply: createdReply,
      ...createdReply,
    });
  };

  app.post('/api/support/tickets/:id/replies', postReplyHandler);
  app.post('/api/support-tickets/:id/replies', postReplyHandler);

  // Status update: PUT & PATCH /api/support-tickets/:id/status & /api/support/tickets/:id/status
  const updateStatusHandler = async (request: any, reply: any) => {
    const userId = request.sessionUserId;
    if (!userId) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });

    const user = database.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
    if (user?.role !== 'admin') {
      return reply.code(403).send({ error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถเปลี่ยนสถานะได้' });
    }

    const ticket = database.prepare('SELECT * FROM support_tickets WHERE id = ?').get(request.params.id) as any;
    if (!ticket) return reply.code(404).send({ error: 'ไม่พบเรื่องติดต่อ' });

    const { status, assignedAdminId } = request.body || {};
    if (!status) return reply.code(400).send({ error: 'กรุณาระบุสถานะ' });

    const now = Date.now();
    const adminIdToSet = assignedAdminId !== undefined ? assignedAdminId : ticket.assigned_admin_id || userId;

    database.prepare(`
      UPDATE support_tickets SET status = ?, assigned_admin_id = ?, updated_at = ? WHERE id = ?
    `).run(status, adminIdToSet, now, ticket.id);

    const statusMap: Record<string, string> = {
      open: 'รอดำเนินการ',
      in_progress: 'กำลังตรวจสอบ',
      resolved: 'แก้ไขแล้ว',
      closed: 'ปิดเรื่อง',
    };

    const notifId = randomUUID();
    const notifTitle = `🎫 สถานะเรื่องติดต่ออัปเดต: ${ticket.ticket_ref}`;
    const notifMsg = `เรื่องติดต่อของคุณเปลี่ยนสถานะเป็น "${statusMap[status] || status}"`;
    const linkUrl = `/help-support?ticketId=${ticket.id}`;

    database.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, link_url, is_read, created_at)
      VALUES (?, ?, 'support_ticket', ?, ?, ?, 0, ?)
    `).run(notifId, ticket.user_id, notifTitle, notifMsg, linkUrl, now);

    const updatedTicket = formatTicket({
      ...ticket,
      status,
      assigned_admin_id: adminIdToSet,
      updated_at: now,
    });

    return {
      ok: true,
      ticket: updatedTicket,
      ...updatedTicket,
    };
  };

  app.patch('/api/support/tickets/:id/status', updateStatusHandler);
  app.put('/api/support/tickets/:id/status', updateStatusHandler);
  app.patch('/api/support-tickets/:id/status', updateStatusHandler);
  app.put('/api/support-tickets/:id/status', updateStatusHandler);
}

export const registerSupportTicketRoutes = registerSupportTicketsRoutes;
