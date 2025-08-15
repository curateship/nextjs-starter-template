'use client'

import { useState, useEffect } from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { BlockContainer } from '@/components/ui/block-container'
import Link from 'next/link'

interface FaqItem {
    id: string
    question: string
    answer: string
}

interface ProductFAQBlockProps {
    content?: {
        title?: string
        subtitle?: string
        faqItems?: FaqItem[]
    }
}

const ProductFAQBlock = ({ content }: ProductFAQBlockProps) => {
    const defaultFaqItems = [
        {
            id: 'item-1',
            question: 'What are the product specifications?',
            answer: 'Our product features premium materials and high-quality construction. Detailed specifications are available in the product documentation section.',
        },
        {
            id: 'item-2',
            question: 'Is this product compatible with other systems?',
            answer: 'Yes, this product is designed to be compatible with most standard systems. Please check the compatibility chart for specific model requirements.',
        },
        {
            id: 'item-3',
            question: 'What warranty is included?',
            answer: 'This product comes with a comprehensive 2-year warranty covering manufacturing defects and normal wear. Extended warranty options are available.',
        },
        {
            id: 'item-4',
            question: 'How do I install or set up this product?',
            answer: 'Installation is straightforward and includes step-by-step instructions. Professional installation services are also available in most areas.',
        },
        {
            id: 'item-5',
            question: 'What support is available after purchase?',
            answer: 'We provide 24/7 customer support, online resources, video tutorials, and access to our technical support team for any questions or issues.',
        },
    ]

    // Use content items if available and not empty, otherwise use defaults
    const faqItems = (content?.faqItems && content.faqItems.length > 0) 
        ? content.faqItems 
        : defaultFaqItems

    return (
        <BlockContainer
            header={{
                title: content?.title || "Product FAQ",
                subtitle: content?.subtitle || "Get answers to common questions about this product, its features, compatibility, and support options.",
                align: "center"
            }}
        >
            <div className="mt-12">
                {!faqItems || faqItems.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-muted-foreground">No FAQ items found</p>
                    </div>
                ) : (
                    <Accordion
                        type="single"
                        collapsible
                        className="bg-card ring-foreground/5 rounded-(--radius) w-full border border-transparent px-8 py-3 shadow ring-1">
                        {faqItems.map((item) => (
                            <AccordionItem
                                key={item.id}
                                value={item.id}
                                className="border-dotted">
                                <AccordionTrigger className="cursor-pointer text-base hover:no-underline">
                                    {item.question}
                                </AccordionTrigger>
                                <AccordionContent>
                                    <p className="text-base">{item.answer}</p>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                )}

                <p className="text-muted-foreground mt-6">
                    Need more information? Contact our{' '}
                    <Link
                        href="#"
                        className="text-primary font-medium hover:underline">
                        product support team
                    </Link>
                </p>
            </div>
        </BlockContainer>
    )
}

export { ProductFAQBlock };