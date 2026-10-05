// pnpm demos:record no-js-first: the same page twice. With JavaScript off, the server checks
// the form and answers with a new page. With it on, fields are checked as you type and the
// reply is sent without a reload. Format: scripts/lib/demos.mjs.

const slowly = { delay: 70 };

export default {
  pitch:
    'One page that works completely with JavaScript off, then checks as you type and submits without a reload once JavaScript loads: same markup, same schema on both sides.',
  usual:
    'Usually you pick one: a server-rendered form, or a client app that is blank until its bundle runs, and validation rules written twice.',
  scenes: [
    {
      id: 'js-off',
      javaScript: false,
      run: async (page, { pause, poster }) => {
        await pause(900);
        await page.getByLabel('Name').pressSequentially('Grace H.', slowly);
        await page.getByLabel('Email').pressSequentially('grace@example.com', slowly);
        await pause(300);
        await page.getByRole('button', { name: 'Count me in' }).click();
        await page.getByText('Grace already replied with that email.').waitFor();
        await pause(1800); // the server's answer: a new page with the error and the values kept
        await page.getByLabel('Name').fill('');
        await page.getByLabel('Name').pressSequentially('Ada', slowly);
        await page.getByLabel('Email').fill('');
        await page.getByLabel('Email').pressSequentially('ada@example.com', slowly);
        await page.getByLabel('Bringing').selectOption('2');
        await pause(300);
        await page.getByRole('button', { name: 'Count me in' }).click();
        await page.getByText("You're on the list").waitFor();
        await pause(800);
        await poster();
        await pause(1200);
      },
    },
    {
      id: 'js-on',
      run: async (page, { pause, poster }) => {
        await page.getByText('JavaScript on.').waitFor();
        await pause(900);
        await page.getByLabel('Name').pressSequentially('Linus', slowly);
        await page.getByLabel('Email').pressSequentially('linus@', { delay: 160 });
        await page.getByText('Enter a valid email address.').waitFor();
        await pause(900); // the error appears while typing, before any submit
        await poster();
        await page.getByLabel('Email').pressSequentially('example.com', { delay: 110 });
        await pause(700); // and goes away as soon as the address is valid
        await page.getByRole('button', { name: 'Count me in' }).click();
        await page.getByText("You're on the list").waitFor();
        await pause(2000);
      },
    },
  ],
};
