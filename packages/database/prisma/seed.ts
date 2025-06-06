import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding database...');
  
  // Seed categories
  const categories = [
    { name: 'Writing' },
    { name: 'Programming' },
    { name: 'Marketing' },
    { name: 'Business' },
    { name: 'Education' },
    { name: 'Design' },
    { name: 'AI Tools' },
  ];
  
  console.log('Seeding categories...');
  for (const category of categories) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: {},
      create: category,
    });
  }
  
  // Seed test user
  console.log('Seeding test user...');
  const testUser = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      name: 'Test User',
      email: 'test@example.com',
    },
  });
  
  // Get categories for reference
  const writingCategory = await prisma.category.findUnique({
    where: { name: 'Writing' },
  });
  
  const programmingCategory = await prisma.category.findUnique({
    where: { name: 'Programming' },
  });
  
  const marketingCategory = await prisma.category.findUnique({
    where: { name: 'Marketing' },
  });
  
  // Seed sample prompts
  console.log('Seeding sample prompts...');
  if (writingCategory && programmingCategory && marketingCategory) {
    const prompts = [
      {
        title: 'SEO Blog Post Generator',
        description: 'Generate high-quality blog posts optimized for search engines with just a few keywords.',
        content: 'You are an expert SEO writer with deep knowledge of search engine optimization. Write a blog post about [TOPIC] that is optimized for SEO. Include appropriate headings, meta description, and focus on the keyword [KEYWORD]. The post should be informative, engaging, and approximately 1500 words.',
        price: 4.99,
        published: true,
        userId: testUser.id,
        categoryId: writingCategory.id,
      },
      {
        title: 'Python Code Refactor Assistant',
        description: 'AI prompt that helps refactor Python code for better readability and performance.',
        content: 'You are a senior Python developer with expertise in clean code and performance optimization. Analyze the following Python code: [CODE]. Refactor it to improve: 1) Readability, 2) Performance, 3) Adherence to PEP 8 standards. Explain the changes you make and why they improve the code.',
        price: 9.99,
        published: true,
        userId: testUser.id,
        categoryId: programmingCategory.id,
      },
      {
        title: 'Marketing Email Generator',
        description: 'Create compelling marketing emails that convert readers. This prompt helps you generate content that drives engagement.',
        content: 'You are an expert email marketer with a record of creating high-converting campaigns. Create a marketing email for [PRODUCT/SERVICE] targeting [AUDIENCE]. The email should have: 1) An attention-grabbing subject line, 2) Compelling opening paragraph, 3) Clear value proposition, 4) Persuasive body copy, 5) Strong call to action. The tone should be [TONE] and the length should be approximately [LENGTH] words.',
        price: 5.99,
        published: true,
        userId: testUser.id,
        categoryId: marketingCategory.id,
      },
    ];
    
    for (const prompt of prompts) {
      await prisma.prompt.create({
        data: prompt,
      });
    }
  }
  
  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 