import { expect, test } from '@playwright/test';

const testRunId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function register(page, user) {
  await page.goto('/signup');
  await page.getByTestId('register-name').fill(user.name);
  await page.getByTestId('register-email').fill(user.email);
  await page.getByTestId('register-password').fill(user.password);
  await page.getByTestId('register-submit').click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function login(page, user) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(user.email);
  await page.getByTestId('login-password').fill(user.password);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function createInstantMeeting(page, meeting) {
  await page.goto('/');
  await page.getByTestId('start-meeting-button').click();
  await page.getByTestId('create-meeting-title').fill(meeting.title);
  await page.getByTestId('create-meeting-code').fill(meeting.id);
  await page.getByTestId('create-setting-waitingRoom').uncheck();
  await page.getByTestId('create-meeting-submit').click();
  await expect(page).toHaveURL(new RegExp(`/meeting/${meeting.id}$`));
  await page.getByTestId('prejoin-submit').click();
  await expect(page.getByTestId('meeting-panel-participants')).toBeVisible({ timeout: 15000 });
}

async function joinMeetingAsGuest(page, meetingId, guestName) {
  await page.goto(`/meeting/${meetingId}`);
  await page.getByTestId('prejoin-name-input').fill(guestName);
  await page.getByTestId('prejoin-submit').click();
  await expect(page.getByTestId('meeting-panel-participants')).toBeVisible({ timeout: 15000 });
}

async function openPanel(page, panel) {
  await page.mouse.move(500, 500);
  await page.getByTestId(`meeting-control-${panel}`).click();
  await expect(page.getByTestId(`meeting-panel-${panel}`)).toBeVisible();
}

test.describe('Vync E2E core flows', () => {
  test('registers a user and logs in with the same account', async ({ page, context }) => {
    const user = {
      name: 'E2E Ada',
      email: `e2e-ada-${testRunId}@example.test`,
      password: 'Secret123!',
    };

    await register(page, user);
    await context.clearCookies();
    await login(page, user);

    await expect(page.getByRole('heading', { name: /Welcome back, E2E Ada/i })).toBeVisible();
  });

  test('creates a meeting, joins as guest, chats, updates participants, and opens history after ending', async ({ browser }) => {
    const hostUser = {
      name: 'E2E Host',
      email: `e2e-host-${testRunId}@example.test`,
      password: 'Secret123!',
    };
    const meeting = {
      id: `E2E-${testRunId.slice(-3).toUpperCase()}-MTG`.replace(/[^A-Z0-9-]/g, 'A').slice(0, 11),
      title: `E2E Meeting ${testRunId}`,
    };
    const chatMessage = `Hello from E2E ${testRunId}`;

    const hostContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const guestContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    try {
      await register(hostPage, hostUser);
      await createInstantMeeting(hostPage, meeting);

      await joinMeetingAsGuest(guestPage, meeting.id, 'E2E Guest');

      await openPanel(hostPage, 'participants');
      await openPanel(guestPage, 'participants');
      await expect(hostPage.getByTestId('participant-list-item').filter({ hasText: 'E2E Guest' })).toBeVisible();
      await expect(guestPage.getByTestId('participant-list-item').filter({ hasText: 'E2E Host' })).toBeVisible();

      await openPanel(hostPage, 'chat');
      await openPanel(guestPage, 'chat');
      await hostPage.getByTestId('chat-message-input').fill(chatMessage);
      await hostPage.getByTestId('chat-send-button').click();
      await expect(guestPage.getByTestId('chat-message').filter({ hasText: chatMessage })).toBeVisible();

      await openPanel(hostPage, 'participants');
      await expect(hostPage.getByTestId('end-meeting-button')).toBeVisible();
      await hostPage.getByTestId('end-meeting-button').click({ force: true });
      await hostPage.waitForURL(/\/$/, { timeout: 10000 }).catch(() => {});
      await hostPage.waitForTimeout(1000);

      await hostPage.goto('/meetings/history');
      await expect(hostPage.getByTestId('meeting-history-row').filter({ hasText: meeting.title })).toBeVisible({
        timeout: 15000,
      });
    } finally {
      await guestContext.close().catch(() => {});
      await hostContext.close().catch(() => {});
    }
  });
});
