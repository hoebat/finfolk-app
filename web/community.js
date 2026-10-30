import { readResource } from './activity.js';
import { showWelcome } from './welcome.js';
const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
const link = (text, url) => {
  const a = el('a', text);
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
};
export function installCommunity({
  shell,
  getBeaches = () => [],
  getSelectedBeach = () => null,
  loadConfig = () =>
    readResource(new URL('./neon-config.json', import.meta.url), {
      read: 'json',
    }),
  loadClient = () => import('./neon-client.js'),
} = {}) {
  const root = document.getElementById('account-page');
  let config,
    client,
    pending,
    epoch = 0,
    beachEpoch = 0,
    nextRefresh = Infinity,
    observedUser;
  async function api() {
    if (!pending)
      pending = (async () => {
        config = await loadConfig();
        if (!config.enabled || !config.authUrl)
          throw Error(
            'Accounts are being prepared. Maps and saved regions are available now.',
          );
        client = await (await loadClient()).createLogbookClient(config);
        client.observe?.((user) => {
          const key = user?.uid || '';
          if (observedUser !== undefined && observedUser !== key) {
            document
              .querySelectorAll('.buddy-stats')
              .forEach((n) => n.remove());
            document.getElementById('regulars-panel')?.remove();
            epoch++;
            beachEpoch++;
          }
          observedUser = key;
        });
        return client;
      })().catch((e) => {
        pending = null;
        throw e;
      });
    return pending;
  }
  const button = (text, fn, cls = 'secondary') => {
    const b = el('button', text, cls);
    b.type = 'button';
    b.onclick = async () => {
      b.disabled = true;
      try {
        await fn();
      } catch (e) {
        const host = b.closest('section') || root;
        let status = host.querySelector('[role=status]');
        if (!status) {
          status = el('p');
          status.setAttribute('role', 'status');
          host.append(status);
        }
        status.textContent = e.message;
      } finally {
        b.disabled = false;
      }
    };
    return b;
  };
  const field = (parent, label, name, value = '', type = 'text') => {
    const l = el('label', label),
      n = el(type === 'textarea' ? 'textarea' : 'input');
    n.name = name;
    if (type !== 'textarea') n.type = type;
    if (type === 'checkbox') n.checked = !!value;
    else n.value = value ?? '';
    l.append(n);
    parent.append(l);
    return n;
  };
  async function account() {
    if (shell.route.view !== 'account') return;
    const generation = ++epoch;
    root.replaceChildren(
      el('h1', 'Your FinFolk'),
      el('p', 'Your spots. Your people. Your kind of water.', 'account-intro'),
    );
    root.append(
      button('How FinFolk works', () => showWelcome()),
      button('My sessions', () => shell.navigate('logbook')),
    );
    try {
      const a = await api();
      if (generation !== epoch) return;
      if (!a.user) {
        const box = el('section', undefined, 'account-card'),
          form = el('form');
        box.append(
          el('h2', 'Join the folk'),
          el('p', 'Explore freely. Sign in to check in and meet divers.'),
        );
        const name = field(form, 'Display name', 'name'),
          email = field(form, 'Email', 'email', '', 'email'),
          password = field(form, 'Password', 'password', '', 'password');
        email.autocomplete = 'email';
        password.autocomplete = 'current-password';
        password.minLength = 8;
        email.required = password.required = true;
        const submit = el('button', 'Sign in', 'primary');
        submit.type = 'submit';
        form.append(submit);
        form.onsubmit = async (e) => {
          e.preventDefault();
          submit.disabled = true;
          try {
            await a.email(email.value, password.value);
            await account();
          } catch (error) {
            status.textContent = error.message;
          } finally {
            submit.disabled = false;
          }
        };
        const status = el('p');
        status.setAttribute('role', 'status');
        box.append(
          form,
          button('Create account', async () => {
            if (!form.reportValidity()) return;
            const result = await a.auth.signUp.email({
              email: email.value,
              password: password.value,
              name: name.value.trim() || 'Diver',
            });
            if (result.error) throw Error(result.error.message);
            await a.refresh();
            await account();
          }),
          button('Reset password', async () => {
            if (!email.value || !email.reportValidity()) return;
            await a.reset(email.value);
            status.textContent =
              'Check your email for password reset instructions.';
          }),
          status,
        );
        if (config.googleEnabled)
          box.append(button('Continue with Google', () => a.google()));
        root.append(box);
        const token = new URL(location.href).searchParams.get('token');
        if (token) {
          const reset = el('section', undefined, 'account-card'),
            next = field(reset, 'New password', 'new-password', '', 'password');
          next.minLength = 8;
          reset.append(
            button('Save new password', async () => {
              if (!next.reportValidity()) return;
              await a.resetPassword(token, next.value);
              status.textContent = 'Password updated. You can sign in.';
            }),
          );
          root.append(reset);
        }
        return;
      }
      const me = await a.call('me');
      if (generation !== epoch) return;
      const p = me.profile,
        form = el('form', undefined, 'account-card');
      form.append(el('h2', 'Profile & social links'));
      const name = field(form, 'Display name', 'displayName', p.displayName),
        bio = field(form, 'A little about you', 'bio', p.bio, 'textarea'),
        instagram = field(
          form,
          'Instagram profile link',
          'instagram',
          p.instagram,
          'url',
        ),
        tiktok = field(form, 'TikTok profile link', 'tiktok', p.tiktok, 'url');
      name.required = true;
      name.maxLength = 80;
      bio.maxLength = 500;
      form.append(
        el(
          'small',
          'Links are self-provided. Photos and videos stay on Instagram or TikTok.',
        ),
      );
      const open = field(
        form,
        'Open — appear at beaches and receive buddy suggestions',
        'open',
        p.open,
        'checkbox',
      );
      form.append(
        el(
          'small',
          'Closed pauses discovery and visit-based sharing. Accepted buddies keep access to statistics you permit.',
        ),
      );
      const choices = el('fieldset');
      choices.append(el('legend', 'Beaches you’re interested in (up to 20)'));
      const search = field(
          choices,
          'Find a beach',
          'beach-filter',
          '',
          'search',
        ),
        select = el('select');
      select.multiple = true;
      select.size = 6;
      select.setAttribute('aria-label', 'Beaches of interest');
      const selected = new Set(p.beaches || []);
      function options() {
        select.replaceChildren();
        for (const b of getBeaches()
          .filter(
            (b) =>
              selected.has(b.id) ||
              `${b.name} ${b.area_name}`
                .toLowerCase()
                .includes(search.value.toLowerCase()),
          )
          .slice(0, 150)) {
          const o = el('option', `${b.name} · ${b.area_name || b.state}`);
          o.value = b.id;
          o.selected = selected.has(b.id);
          select.append(o);
        }
      }
      search.oninput = options;
      select.onchange = () => {
        for (const o of select.options)
          o.selected ? selected.add(o.value) : selected.delete(o.value);
      };
      options();
      choices.append(select);
      form.append(choices);
      function checks(title, values, allowed) {
        const group = el('fieldset');
        group.append(el('legend', title));
        const inputs = allowed.map((value) => [
          value,
          field(group, value, value, values?.includes(value), 'checkbox'),
        ]);
        form.append(group);
        return () => inputs.filter(([, n]) => n.checked).map(([v]) => v);
      }
      const activities = checks('Water activities', p.activities, [
          'freediving',
          'ocean-swimming',
          'spearfishing',
        ]),
        availability = checks('Usual times (optional)', p.availability, [
          'weekday mornings',
          'weekday afternoons',
          'weekend mornings',
          'weekend afternoons',
        ]);
      const experience = el('select');
      experience.setAttribute('aria-label', 'Self-described experience');
      for (const [value, label] of [
        ['', 'Experience: prefer not to say'],
        ['new', 'New to diving'],
        ['comfortable', 'Comfortable'],
        ['experienced', 'Experienced'],
      ]) {
        const o = el('option', label);
        o.value = value;
        experience.append(o);
      }
      experience.value = p.experience || '';
      form.append(experience);
      const depth = field(
        form,
        'Preferred depth goal, metres (optional)',
        'depthGoal',
        p.depthGoal ?? '',
        'number',
      );
      depth.min = 1;
      depth.max = 100;
      const sharing = el('fieldset');
      sharing.append(el('legend', 'Statistics you allow others to see'));
      const shareFields = {};
      for (const [key, label] of Object.entries({
        visits: 'Recent beach visits',
        months: 'Months active at this beach',
        dives: 'Logged dives at this beach',
        time: 'Total logged time in the water',
        depth: 'Typical logged maximum depth',
      }))
        shareFields[key] = field(
          sharing,
          label,
          key,
          p.sharing?.[key],
          'checkbox',
        );
      sharing.append(
        el(
          'small',
          'Both Open divers need 3 visit days in the last 30 days for activity stats, and 5 for dive summaries. Accepted buddies bypass these visit gates. Private fields stay private.',
        ),
      );
      form.append(sharing);
      const status = el('p');
      status.setAttribute('role', 'status');
      const save = el('button', 'Save profile', 'primary');
      save.type = 'submit';
      form.append(save, status);
      form.onsubmit = async (e) => {
        e.preventDefault();
        save.disabled = true;
        try {
          await a.call('preferences', {
            profile: {
              displayName: name.value,
              bio: bio.value,
              instagram: instagram.value,
              tiktok: tiktok.value,
              open: open.checked,
              beaches: [...selected],
              activities: activities(),
              availability: availability(),
              experience: experience.value,
              depthGoal: depth.value ? Number(depth.value) : null,
              sharing: Object.fromEntries(
                Object.entries(shareFields).map(([k, n]) => [k, n.checked]),
              ),
            },
          });
          status.textContent = 'Saved.';
        } catch (error) {
          status.textContent = error.message;
        } finally {
          save.disabled = false;
        }
      };
      root.append(form);
      if (!a.user.emailVerified) {
        const verify = el('section', undefined, 'account-card');
        verify.append(
          el('h2', 'Verify your email'),
          button('Send verification code', async () => {
            await a.verify();
            status.textContent = 'Check your email for the code.';
          }),
        );
        const code = field(verify, 'Email code', 'verification-code');
        code.inputMode = 'numeric';
        verify.append(
          button('Verify code', async () => {
            await a.verifyCode(code.value);
            await account();
          }),
        );
        root.append(verify);
      }
      const buddies = el('section', undefined, 'account-card');
      buddies.append(el('h2', 'Your buddies'));
      root.append(buddies);
      for (const row of await a.call('connections')) {
        const card = el('div', undefined, 'buddy-card');
        card.append(
          el('strong', row.name),
          el(
            'small',
            row.status === 'accepted'
              ? 'Connected'
              : row.requested_by === a.user.uid
                ? 'Request sent'
                : 'Wants to connect',
          ),
        );
        if (row.status === 'pending' && row.requested_by !== a.user.uid)
          for (const mode of ['accept', 'decline'])
            card.append(
              button(mode === 'accept' ? 'Accept' : 'Decline', async () => {
                await a.call('connection', { target: row.id, mode });
                await account();
              }),
            );
        if (row.status === 'accepted') {
          if (row.instagram) card.append(link('Instagram', row.instagram));
          if (row.tiktok) card.append(link('TikTok', row.tiktok));
          card.append(
            button('Remove connection', async () => {
              await a.call('connection', { target: row.id, mode: 'remove' });
              await account();
            }),
          );
        }
        card.append(
          button('Block', async () => {
            await a.call('block', { target: row.id });
            await account();
          }),
        );
        buddies.append(card);
      }
      const visits = el('details');
      visits.append(el('summary', 'Your check-ins'));
      for (const row of await a.call('myCheckins')) {
        const line = el('p', `${row.name} · ${row.day} `);
        line.append(
          button('Remove', async () => {
            await a.call('removeCheckin', {
              beachId: row.beach_id,
              day: row.day,
            });
            await account();
          }),
        );
        visits.append(line);
      }
      root.append(visits);
      const blocks = el('details');
      blocks.append(el('summary', 'Blocked profiles'));
      for (const row of await a.call('blocks')) {
        const line = el('p', row.name);
        line.append(
          button('Unblock', async () => {
            await a.call('unblock', { target: row.id });
            await account();
          }),
        );
        blocks.append(line);
      }
      root.append(blocks);
      root.append(
        button('Sign out', async () => {
          await a.signOut();
          await account();
        }),
      );
      const deletion = el('details');
      deletion.append(el('summary', 'Delete account'));
      const pass = field(
        deletion,
        'Password to confirm deletion',
        'delete-password',
        '',
        'password',
      );
      deletion.append(
        button('Delete my account and data', async () => {
          if (
            !confirm(
              'Permanently delete your FinFolk account, check-ins, sessions and connections?',
            )
          )
            return;
          await a.reauthenticate(pass.value);
          await a.deleteAccount(pass.value);
          await a.signOut();
          await account();
        }),
      );
      root.append(deletion);
    } catch (error) {
      if (generation === epoch) {
        root.append(
          el('p', error.message, 'account-status'),
          button('Retry', () => account()),
        );
        if (client?.user && error.message === 'Account has been deleted.') {
          const password = field(
            root,
            'Password to finish deleting sign-in',
            'finish-delete',
            '',
            'password',
          );
          root.append(
            button('Finish account deletion', async () => {
              const result = await client.auth.deleteUser(
                password.value ? { password: password.value } : {},
              );
              if (result.error) throw Error(result.error.message);
              await client.refresh();
              await account();
            }),
          );
        }
        if (client?.user)
          root.append(
            button('Sign out', async () => {
              await client.signOut();
              await account();
            }),
          );
      }
    }
  }
  async function beachPanel(beach) {
    const generation = ++beachEpoch;
    document.getElementById('regulars-panel')?.remove();
    if (!beach) return;
    const host = document.getElementById('beach-summary');
    if (!host) return;
    const box = el('section', undefined, 'regulars-panel');
    box.id = 'regulars-panel';
    box.append(
      el('h3', 'The folk here'),
      el(
        'p',
        'Recent faces, shared spots. Regulars are based on the last 30 days.',
      ),
    );
    host.append(box);
    try {
      const a = await api();
      if (generation !== beachEpoch) return;
      if (!a.user) {
        box.append(
          button('Sign in to meet divers', () => shell.navigate('account')),
        );
        return;
      }
      box.append(
        button(
          'Check in',
          async () => {
            const result = await a.call('checkin', { beachId: beach.id });
            await beachPanel(beach);
            const status = el(
              'p',
              `${result.count} of 3 regular visit days this month · self-reported`,
            );
            document.getElementById('regulars-panel')?.prepend(status);
          },
          'primary',
        ),
      );
      const status = el('p');
      status.setAttribute('role', 'status');
      box.append(status);
      const cards = el('div'),
        regularCards = el('div'),
        suggestedCards = el('div');
      cards.append(
        el('h4', 'Regulars'),
        regularCards,
        el('h4', 'Suggested buddies'),
        suggestedCards,
      );
      regularCards.append(el('small', 'Three visit days in the last 30 days.'));
      box.append(cards);
      let cursor = null;
      async function page() {
        const data = await a.call('community', { beachId: beach.id, cursor });
        if (generation !== beachEpoch) return;
        cursor = data.cursor;
        nextRefresh = data.refreshAt || Infinity;
        status.textContent = `${data.ownVisits} of 3 regular visit days in the last 30 days`;
        for (const p of data.people) {
          const card = el('article', undefined, 'buddy-card');
          card.append(
            el('h4', p.displayName),
            el(
              'small',
              p.regular ? 'Regular · active this month' : 'Recently checked in',
            ),
            el('p', p.bio || ''),
            el('small', p.reasons.join(' · ')),
          );
          if (p.instagram) card.append(link('Instagram', p.instagram));
          if (p.tiktok) card.append(link('TikTok', p.tiktok));
          card.append(
            button('View shared statistics', async () => {
              card.querySelector('.buddy-stats')?.remove();
              const data = await a.call('stats', {
                  target: p.id,
                  beachId: beach.id,
                }),
                stats = el('div', undefined, 'buddy-stats');
              stats.append(
                el(
                  'p',
                  data.level < 1 && data.sharingClosed
                    ? 'Visit-based sharing is Closed. An accepted buddy connection is required.'
                    : data.level < 1
                      ? `You: ${Math.min(3, data.progress)} of 3 visit days. Activity unlocks when both divers qualify.`
                      : data.level < 2
                        ? `You: ${Math.min(5, data.progress)} of 5 visit days. Dive summaries unlock when both divers qualify.`
                        : 'Permitted statistics',
                ),
              );
              for (const [key, value] of Object.entries(data.stats))
                stats.append(
                  el(
                    'p',
                    `${{ visits: 'Visits in 30 days', months: 'Months active', dives: 'Logged dives', minutes: 'Minutes in water', typicalDepth: 'Typical logged maximum depth (m)' }[key]}: ${value ?? 'Not recorded'}`,
                  ),
                );
              stats.append(
                el(
                  'small',
                  'Self-reported. Only statistics this person permits are shown.',
                ),
              );
              card.append(stats);
            }),
          );
          card.append(
            button(
              p.connection === 'accepted' ? 'Connected' : 'Ask to connect',
              async () => {
                if (p.connection === 'accepted') {
                  status.textContent = 'You are already connected.';
                  return;
                }
                await a.call('connection', { target: p.id, mode: 'request' });
                status.textContent =
                  'Request sent. They can accept it in Account.';
              },
            ),
            button('Block', async () => {
              await a.call('block', { target: p.id });
              card.remove();
            }),
          );
          const report = el('details');
          report.append(el('summary', 'Report profile'));
          const reason = field(
            report,
            'Reason',
            'report-reason',
            '',
            'textarea',
          );
          report.append(
            button('Send report', async () => {
              await a.call('report', { target: p.id, reason: reason.value });
              status.textContent = 'Report submitted privately.';
            }),
          );
          card.append(report);
          (p.regular ? regularCards : suggestedCards).append(card);
        }
        more.hidden = !cursor;
        if (!data.people.length && !cards.querySelector('.buddy-card'))
          cards.append(
            el(
              'p',
              'Be the first to check in. Switch your profile to Open to appear here.',
            ),
          );
      }
      const more = button('More divers', page);
      box.append(more);
      await page();
      const posts = el('section');
      posts.append(el('h4', 'From Instagram & TikTok'));
      const url = field(
        posts,
        'Post, Reel or TikTok video link',
        'social-post',
        '',
        'url',
      );
      posts.append(
        button('Add post link', async () => {
          await a.call('post', { beachId: beach.id, url: url.value });
          await beachPanel(beach);
        }),
      );
      for (const post of await a.call('posts', { beachId: beach.id })) {
        const row = el('div');
        row.append(link(`${post.author || 'Diver'} · Open original`, post.url));
        const load = button('Load preview', async () => {
          const iframe = el('iframe');
          iframe.loading = 'lazy';
          iframe.title = 'Social post';
          iframe.referrerPolicy = 'no-referrer';
          iframe.allow = 'fullscreen';
          iframe.src = post.url.includes('instagram.com')
            ? post.url.replace(/\/$/, '') + '/embed/'
            : 'https://www.tiktok.com/player/v1/' +
              post.url.match(/\/video\/(\d+)/)[1];
          row.append(iframe);
          load.remove();
        });
        row.append(load);
        if (post.owner_id === a.user.uid)
          row.append(
            button('Remove', async () => {
              await a.call('removePost', { id: post.id });
              await beachPanel(beach);
            }),
          );
        posts.append(row);
      }
      box.append(posts);
    } catch (error) {
      if (generation === beachEpoch)
        box.append(
          el('p', error.message),
          button('Retry community', () => beachPanel(beach)),
        );
    }
  }
  function invalidate() {
    epoch++;
    beachEpoch++;
    document.querySelectorAll('.buddy-stats').forEach((n) => n.remove());
    if (shell.route.view === 'account') account();
    else if (getSelectedBeach()) beachPanel(getSelectedBeach());
  }
  shell.subscribe(() => {
    epoch++;
    beachEpoch++;
    document.querySelectorAll('.buddy-stats').forEach((n) => n.remove());
    if (shell.route.view === 'account') account();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) invalidate();
  });
  const interval = setInterval(() => {
    if (!root.isConnected) {
      clearInterval(interval);
      return;
    }
    if (!document.hidden) {
      document.querySelectorAll('.buddy-stats').forEach((n) => n.remove());
      if (Date.now() >= nextRefresh) {
        nextRefresh = Infinity;
        const b = getSelectedBeach();
        if (b) beachPanel(b);
      }
    }
  }, 60000);
  interval.unref?.();
  if (shell.route.view === 'account') account();
  return { account, beachPanel, invalidate };
}
